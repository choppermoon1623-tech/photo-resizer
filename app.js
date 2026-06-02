const state = {
  files: [],
  outputs: []
};

const elements = {
  clearButton: document.querySelector("#clearButton"),
  downloadZipButton: document.querySelector("#downloadZipButton"),
  dropZone: document.querySelector("#dropZone"),
  emptyState: document.querySelector("#emptyState"),
  fileCount: document.querySelector("#fileCount"),
  fileInput: document.querySelector("#fileInput"),
  format: document.querySelector("#format"),
  imageList: document.querySelector("#imageList"),
  maxHeight: document.querySelector("#maxHeight"),
  maxWidth: document.querySelector("#maxWidth"),
  noUpscale: document.querySelector("#noUpscale"),
  outputSize: document.querySelector("#outputSize"),
  processButton: document.querySelector("#processButton"),
  quality: document.querySelector("#quality"),
  qualityOutput: document.querySelector("#qualityOutput"),
  sourceSize: document.querySelector("#sourceSize")
};

const extensionByType = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

elements.fileInput.addEventListener("change", (event) => {
  addFiles(event.target.files);
  elements.fileInput.value = "";
});

["dragenter", "dragover"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.add("is-over");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  elements.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    elements.dropZone.classList.remove("is-over");
  });
});

elements.dropZone.addEventListener("drop", (event) => {
  addFiles(event.dataTransfer.files);
});

elements.quality.addEventListener("input", () => {
  elements.qualityOutput.value = `${elements.quality.value}%`;
});

elements.clearButton.addEventListener("click", resetApp);
elements.processButton.addEventListener("click", processImages);
elements.downloadZipButton.addEventListener("click", downloadZip);

function addFiles(fileList) {
  const imageFiles = Array.from(fileList).filter((file) => file.type.startsWith("image/"));
  const seen = new Set(state.files.map((file) => `${file.name}-${file.size}-${file.lastModified}`));

  imageFiles.forEach((file) => {
    const key = `${file.name}-${file.size}-${file.lastModified}`;
    if (!seen.has(key)) {
      state.files.push(file);
      seen.add(key);
    }
  });

  state.outputs.forEach((output) => URL.revokeObjectURL(output.url));
  state.outputs = [];
  render();
}

function resetApp() {
  state.outputs.forEach((output) => URL.revokeObjectURL(output.url));
  state.files = [];
  state.outputs = [];
  render();
}

async function processImages() {
  if (!state.files.length) return;

  setBusy(true);
  state.outputs.forEach((output) => URL.revokeObjectURL(output.url));
  state.outputs = [];
  render();

  const settings = getSettings();

  for (const file of state.files) {
    try {
      const output = await resizeImage(file, settings);
      state.outputs.push(output);
      render();
    } catch (error) {
      state.outputs.push({
        error: "変換できませんでした",
        file,
        name: file.name,
        originalSize: file.size
      });
      render();
    }
  }

  setBusy(false);
}

function getSettings() {
  return {
    format: elements.format.value,
    maxHeight: Math.max(1, Number(elements.maxHeight.value) || 1600),
    maxWidth: Math.max(1, Number(elements.maxWidth.value) || 1600),
    noUpscale: elements.noUpscale.checked,
    quality: Number(elements.quality.value) / 100
  };
}

async function resizeImage(file, settings) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  const originalWidth = bitmap.width;
  const originalHeight = bitmap.height;
  const scale = Math.min(settings.maxWidth / originalWidth, settings.maxHeight / originalHeight);
  const finalScale = settings.noUpscale ? Math.min(1, scale) : scale;
  const width = Math.max(1, Math.round(originalWidth * finalScale));
  const height = Math.max(1, Math.round(originalHeight * finalScale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", { alpha: settings.format !== "image/jpeg" });
  if (settings.format === "image/jpeg") {
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
  }
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await canvasToBlob(canvas, settings.format, settings.quality);
  const name = buildOutputName(file.name, settings.format);
  return {
    blob,
    file,
    height,
    name,
    originalHeight,
    originalSize: file.size,
    originalWidth,
    size: blob.size,
    url: URL.createObjectURL(blob),
    width
  };
}

function canvasToBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Canvas export failed"));
        }
      },
      format,
      quality
    );
  });
}

function buildOutputName(fileName, format) {
  const extension = extensionByType[format] || "jpg";
  const baseName = fileName.replace(/\.[^.]+$/, "");
  return `${baseName}-resized.${extension}`;
}

function render() {
  elements.fileCount.textContent = `${state.files.length}枚`;
  elements.sourceSize.textContent = formatBytes(sum(state.files, "size"));
  elements.outputSize.textContent = state.outputs.length ? formatBytes(sum(state.outputs, "size")) : "未変換";
  elements.processButton.disabled = !state.files.length;
  elements.downloadZipButton.disabled = !state.outputs.some((output) => output.blob);
  elements.emptyState.hidden = state.files.length > 0;

  const outputsByOriginal = new Map(state.outputs.map((output) => [output.file, output]));
  elements.imageList.innerHTML = "";

  state.files.forEach((file) => {
    const output = outputsByOriginal.get(file);
    elements.imageList.appendChild(createCard(file, output));
  });
}

function createCard(file, output) {
  const card = document.createElement("article");
  card.className = "image-card";

  const image = document.createElement("img");
  image.className = "thumb";
  image.alt = file.name;
  image.src = output?.url || URL.createObjectURL(file);
  if (!output?.url) {
    image.addEventListener("load", () => URL.revokeObjectURL(image.src), { once: true });
  }

  const title = document.createElement("div");
  title.className = "file-name";
  title.textContent = file.name;
  title.title = file.name;

  const meta = document.createElement("div");
  meta.className = "meta";
  meta.appendChild(textLine(`元: ${formatBytes(file.size)}`));

  if (output?.blob) {
    meta.appendChild(textLine(`変換後: ${output.width} x ${output.height}px / ${formatBytes(output.size)}`));
  } else if (output?.error) {
    meta.appendChild(textLine(output.error));
  } else {
    meta.appendChild(textLine("変換待ち"));
  }

  const link = document.createElement("a");
  link.className = "download-link";
  link.textContent = "個別保存";
  if (output?.blob) {
    link.href = output.url;
    link.download = output.name;
  } else {
    link.href = "#";
    link.setAttribute("aria-disabled", "true");
  }

  card.append(image, title, meta, link);
  return card;
}

function textLine(text) {
  const line = document.createElement("span");
  line.textContent = text;
  return line;
}

async function downloadZip() {
  const entries = state.outputs.filter((output) => output.blob);
  if (!entries.length) return;

  elements.downloadZipButton.disabled = true;
  elements.downloadZipButton.textContent = "作成中";

  const files = await Promise.all(
    entries.map(async (entry) => ({
      data: new Uint8Array(await entry.blob.arrayBuffer()),
      name: entry.name
    }))
  );

  const zipBlob = createZip(files);
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `resized-photos-${new Date().toISOString().slice(0, 10)}.zip`;
  link.click();
  URL.revokeObjectURL(url);

  elements.downloadZipButton.textContent = "ZIPで保存";
  elements.downloadZipButton.disabled = false;
}

function createZip(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encodeUtf8(file.name);
    const crc = crc32(file.data);
    const localHeader = concatBytes(
      uint32(0x04034b50),
      uint16(20),
      uint16(0x0800),
      uint16(0),
      uint16(0),
      uint16(0),
      uint32(crc),
      uint32(file.data.length),
      uint32(file.data.length),
      uint16(nameBytes.length),
      uint16(0),
      nameBytes
    );

    localParts.push(localHeader, file.data);

    centralParts.push(
      concatBytes(
        uint32(0x02014b50),
        uint16(20),
        uint16(20),
        uint16(0x0800),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(crc),
        uint32(file.data.length),
        uint32(file.data.length),
        uint16(nameBytes.length),
        uint16(0),
        uint16(0),
        uint16(0),
        uint16(0),
        uint32(0),
        uint32(offset),
        nameBytes
      )
    );

    offset += localHeader.length + file.data.length;
  });

  const centralSize = sumLengths(centralParts);
  const end = concatBytes(
    uint32(0x06054b50),
    uint16(0),
    uint16(0),
    uint16(files.length),
    uint16(files.length),
    uint32(centralSize),
    uint32(offset),
    uint16(0)
  );

  return new Blob([...localParts, ...centralParts, end], { type: "application/zip" });
}

function encodeUtf8(text) {
  return new TextEncoder().encode(text);
}

function uint16(value) {
  const bytes = new Uint8Array(2);
  new DataView(bytes.buffer).setUint16(0, value, true);
  return bytes;
}

function uint32(value) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value >>> 0, true);
  return bytes;
}

function concatBytes(...parts) {
  const bytes = new Uint8Array(sumLengths(parts));
  let offset = 0;
  parts.forEach((part) => {
    bytes.set(part, offset);
    offset += part.length;
  });
  return bytes;
}

function sumLengths(parts) {
  return parts.reduce((total, part) => total + part.length, 0);
}

function crc32(bytes) {
  let crc = -1;
  for (let index = 0; index < bytes.length; index += 1) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ bytes[index]) & 0xff];
  }
  return (crc ^ -1) >>> 0;
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function sum(items, key) {
  return items.reduce((total, item) => total + (item[key] || 0), 0);
}

function formatBytes(bytes) {
  if (!bytes) return "0 MB";
  const units = ["B", "KB", "MB", "GB"];
  const order = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** order;
  return `${value.toFixed(value >= 10 || order === 0 ? 0 : 1)} ${units[order]}`;
}

function setBusy(isBusy) {
  elements.processButton.disabled = isBusy || !state.files.length;
  elements.processButton.textContent = isBusy ? "変換中" : "一括変換";
}

render();
