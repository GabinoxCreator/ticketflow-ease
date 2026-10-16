// ============================================================
// FaceCashless — o NOSSO reconhecimento facial (OS-194, 08/10/2026)
//
// Até aqui a carteira mandava o rosto para a Amazon (AWS Rekognition,
// coleção `festpay-faces`). Decisão do Gabriel em 08/10: a carteira sai da
// Amazon e o reconhecimento passa a ser nosso, sem empresa de fora no meio.
//
// Como funciona: a foto entra nesta edge, um modelo aberto acha o rosto e o
// transforma numa "assinatura" de 128 números (o descritor). Rostos da mesma
// pessoa dão assinaturas próximas; de pessoas diferentes, distantes. A
// assinatura vai para a tabela `face_templates` do NOSSO banco e a busca é
// feita lá (ver a migration `20261008120000_reconhecimento_proprio.sql`).
// A foto em si nunca é gravada: vive só nesta chamada.
//
// O modelo: @vladmandic/face-api 1.7.15 (MIT), que usa a rede de
// reconhecimento do dlib (Davis King, domínio público). Roda em WebAssembly;
// o tempo por foto, medido no servidor do Supabase, está no bloco da Doca.
//
// Os arquivos do modelo vêm de um endereço fixo (por padrão o jsDelivr, nas
// versões travadas abaixo; `ROSTO_MODELOS_URL` e `ROSTO_WASM_URL` trocam o
// endereço) e cada um é conferido pelo sha256 antes de usar. Arquivo diferente
// do esperado = o reconhecimento recusa, nunca roda um modelo trocado.
// ============================================================

import jpeg from "npm:jpeg-js@0.4.4";

/** Nome do modelo gravado junto de cada assinatura. Assinatura de um modelo
 *  não se compara com a de outro: se um dia o modelo mudar, este nome muda e
 *  as antigas deixam de ser buscadas (a pessoa recadastra). */
export const MODELO_ROSTO = "dlib128-faceapi-1.7.15";

const MODELOS_URL = Deno.env.get("ROSTO_MODELOS_URL") ??
  "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model";
const WASM_URL = Deno.env.get("ROSTO_WASM_URL") ??
  "https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-wasm@4.22.0/dist";

/** sha256 de cada arquivo, conferido no download (medido em 08/10/2026). */
const SHA256: Record<string, string> = {
  "ssd_mobilenetv1_model-weights_manifest.json": "888f744dffbc84f5f060d1f8427d9742341943a2dfaaf9205d10029b7e7a2955",
  "ssd_mobilenetv1_model.bin": "2835640602d53718aa6ae9a42896327eaa21beefed056c218d32ca7d79e1e2f8",
  "face_landmark_68_model-weights_manifest.json": "ca4886639f86e99b39fed0c155f81b63317225773bd9616716e887b0153389c9",
  "face_landmark_68_model.bin": "4611ef65c87d836d03d684b30eec4d195d8b219fa1dd58fc58945831c6b9299b",
  "face_recognition_model-weights_manifest.json": "cbaffa501b0b9275a12b63357a6843e7e30c054e1c9151e1a5f879b26e32986b",
  "face_recognition_model.bin": "b413e420d6840b2775fba32008db6f3cddb07d485967fb42cfcf379c16a8c589",
  "tfjs-backend-wasm-simd.wasm": "77ebb28a6d34f371dbbf2086b7f2de8994acd8ea5a3cf1fa24d2c26c840cac7b",
  "tfjs-backend-wasm.wasm": "70a5d516060464e5269f01c74bac1772d6b8ab6cb612acf16b5cdaf61f78d892",
};

/** Lado maior da foto antes de procurar o rosto. Foto de totem já vem por
 *  aí; foto grande do celular é reduzida (mais rápido, mesmo resultado). */
const LADO_MAXIMO = 640;

/** Rosto menor que isto (em px, na foto reduzida) é longe demais para dar
 *  uma assinatura confiável. */
const ROSTO_MINIMO_PX = 80;

/** Prazo para achar o rosto e tirar a assinatura (folga larga sobre o medido). */
const PRAZO_MS = 8000;

const log = (step: string, details?: Record<string, unknown>) =>
  console.log(`[RECONHECIMENTO] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const hex = (buf: ArrayBuffer) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");

/** Baixa um arquivo do modelo e confere o sha256. Erro = não reconhece. */
async function baixar(base: string, nome: string): Promise<ArrayBuffer> {
  const res = await fetch(`${base.replace(/\/$/, "")}/${nome}`);
  if (!res.ok) throw new Error(`modelo ${nome}: http ${res.status}`);
  const buf = await res.arrayBuffer();
  const sha = hex(await crypto.subtle.digest("SHA-256", buf));
  if (sha !== SHA256[nome]) throw new Error(`modelo ${nome}: sha256 não confere`);
  return buf;
}

// deno-lint-ignore no-explicit-any
type FaceApi = any;

let carregando: Promise<FaceApi> | null = null;

/**
 * Carrega o modelo UMA vez por instância da edge (as chamadas seguintes,
 * com a edge quente, reusam). Se falhar, a próxima chamada tenta de novo.
 */
function motor(): Promise<FaceApi> {
  carregando ??= carregar().catch((e) => {
    carregando = null;
    throw e;
  });
  return carregando;
}

async function carregar(): Promise<FaceApi> {
  const t0 = performance.now();

  // O tfjs embutido no face-api acha que está no Node quando vê `process`
  // (a edge tem) e quebra procurando módulos do Node. Escondemos `process`
  // só durante a carga e entregamos a plataforma do Deno à mão.
  // deno-lint-ignore no-explicit-any
  const g = globalThis as any;
  const processo = g.process;
  g.process = undefined;
  let faceapi: FaceApi;
  try {
    faceapi = await import("npm:@vladmandic/face-api@1.7.15/dist/face-api.esm.js");
    const tf = faceapi.tf;
    const enc = new TextEncoder();
    const dec = new TextDecoder();
    tf.setPlatform("deno", {
      fetch: (u: string, i?: RequestInit) => fetch(u, i),
      now: () => performance.now(),
      encode: (t: string) => enc.encode(t),
      decode: (b: Uint8Array) => dec.decode(b),
      isTypedArray: (a: unknown) => ArrayBuffer.isView(a) && !(a instanceof DataView),
      setTimeoutCustom: (f: () => void, d: number) => setTimeout(f, d),
    });
    // Sem DOM: a entrada é sempre tensor. O face-api ainda pergunta "isto é
    // uma imagem do navegador?" (instanceof), então recebe classes vazias que
    // nunca casam; criar canvas aqui é erro de programação, não caminho.
    class SemDom {}
    const semCanvas = () => {
      throw new Error("sem DOM na edge");
    };
    faceapi.env.setEnv({
      Canvas: SemDom,
      CanvasRenderingContext2D: SemDom,
      Image: SemDom,
      ImageData: SemDom,
      Video: SemDom,
      createCanvasElement: semCanvas,
      createImageElement: semCanvas,
      createVideoElement: semCanvas,
      fetch,
      readFile: (p: string) => Deno.readFile(p),
    });

    // WebAssembly sem threads (a edge não abre worker). Os bytes do .wasm são
    // baixados e conferidos aqui, e entregues ao tfjs por URL de memória.
    const [simd, plain] = await Promise.all([
      baixar(WASM_URL, "tfjs-backend-wasm-simd.wasm"),
      baixar(WASM_URL, "tfjs-backend-wasm.wasm"),
    ]);
    const blobUrl = (b: ArrayBuffer) => URL.createObjectURL(new Blob([b], { type: "application/wasm" }));
    tf.env().set("WASM_HAS_MULTITHREAD_SUPPORT", false);
    const simdUrl = blobUrl(simd);
    tf.setWasmPaths(
      {
        "tfjs-backend-wasm-simd.wasm": simdUrl,
        "tfjs-backend-wasm.wasm": blobUrl(plain),
        // O tfjs exige as três entradas; a de threads nunca é usada (desligada acima).
        "tfjs-backend-wasm-threaded-simd.wasm": simdUrl,
      },
      true,
    );
    await tf.setBackend("wasm");
    await tf.ready();
  } finally {
    g.process = processo;
  }

  const tf = faceapi.tf;
  const pesos = async (nome: string) => {
    const manifest = JSON.parse(new TextDecoder().decode(await baixar(MODELOS_URL, `${nome}-weights_manifest.json`)));
    // deno-lint-ignore no-explicit-any
    const specs = manifest.flatMap((grupo: any) => grupo.weights);
    const bin = await baixar(MODELOS_URL, manifest[0].paths[0]);
    return tf.io.decodeWeights(bin, specs);
  };
  // Detector SSD (não o "tiny"): medido em 08/10, o tiny perdia rosto inclinado
  // conforme o tamanho da imagem; o SSD achou o mesmo rosto com folga.
  await faceapi.nets.ssdMobilenetv1.loadFromWeightMap(await pesos("ssd_mobilenetv1_model"));
  await faceapi.nets.faceLandmark68Net.loadFromWeightMap(await pesos("face_landmark_68_model"));
  await faceapi.nets.faceRecognitionNet.loadFromWeightMap(await pesos("face_recognition_model"));

  log("model ready", { backend: tf.getBackend(), ms: Math.round(performance.now() - t0) });
  return faceapi;
}

export type Assinatura =
  | { ok: true; descritor: number[]; rostos: number; qualidade: number }
  | { ok: false; reason: "invalid_image" | "no_face" | "face_too_small" | "engine_failed" };

/** base64 (com ou sem `data:image/...;base64,`) → bytes. */
export function bytesDaFoto(imageBase64: string): Uint8Array | null {
  try {
    const limpo = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    const bytes = Uint8Array.from(atob(limpo), (c) => c.charCodeAt(0));
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

/**
 * A assinatura do rosto da foto.
 *
 * Com mais de uma pessoa na foto (fila atrás, amigo do lado), vale o MAIOR
 * rosto: é quem está na frente da câmera. Mesma regra que o cadastro da
 * Amazon usava (`MaxFaces: 1`). `rostos` diz quantos havia, para o log.
 */
export async function assinaturaDaFoto(bytes: Uint8Array): Promise<Assinatura> {
  let faceapi: FaceApi;
  try {
    faceapi = await motor();
  } catch (e) {
    log("model load failed", { message: (e as Error)?.message?.slice(0, 120) });
    return { ok: false, reason: "engine_failed" };
  }
  const tf = faceapi.tf;

  // deno-lint-ignore no-explicit-any
  let entrada: any;
  try {
    const raw = jpeg.decode(bytes, { useTArray: true, formatAsRGBA: false, maxMemoryUsageInMB: 64 });
    const img = tf.tensor3d(raw.data, [raw.height, raw.width, 3], "int32");
    const escala = Math.min(1, LADO_MAXIMO / Math.max(raw.width, raw.height));
    entrada = escala < 1
      ? tf.tidy(() =>
        tf.image.resizeBilinear(img, [Math.round(raw.height * escala), Math.round(raw.width * escala)]).toInt()
      )
      : img;
    if (entrada !== img) img.dispose();
  } catch {
    return { ok: false, reason: "invalid_image" };
  }

  try {
    const t0 = performance.now();
    // Prazo: um erro dentro do face-api pode deixar a promessa sem resposta
    // (ele usa `new Promise(async ...)`); sem prazo a edge ficaria pendurada.
    const achados = await Promise.race([
      faceapi
        .detectAllFaces(entrada, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.5 }))
        .withFaceLandmarks()
        .withFaceDescriptors(),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), PRAZO_MS)),
    ]);
    const ms = Math.round(performance.now() - t0);

    if (!achados.length) {
      log("no face", { ms });
      return { ok: false, reason: "no_face" };
    }
    // deno-lint-ignore no-explicit-any
    const area = (a: any) => a.detection.box.width * a.detection.box.height;
    const maior = achados.reduce((m: unknown, a: unknown) => (area(a) > area(m) ? a : m), achados[0]);
    if (Math.min(maior.detection.box.width, maior.detection.box.height) < ROSTO_MINIMO_PX) {
      log("face too small", { ms });
      return { ok: false, reason: "face_too_small" };
    }

    log("signature", { ms, faces: achados.length, score: Number(maior.detection.score.toFixed(2)) });
    return {
      ok: true,
      descritor: Array.from(maior.descriptor as Float32Array),
      rostos: achados.length,
      qualidade: maior.detection.score,
    };
  } catch (e) {
    log("signature failed", { message: (e as Error)?.message?.slice(0, 120) });
    return { ok: false, reason: "engine_failed" };
  } finally {
    entrada.dispose();
  }
}
