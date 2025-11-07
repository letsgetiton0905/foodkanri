const appId = "1043472089694693127";
const inventory = JSON.parse(localStorage.getItem("inventory")) || [];
const inventoryList = document.getElementById("inventoryList");
const itemNameInput = document.getElementById("itemName");
const purchaseDateInput = document.getElementById("purchaseDate");
const expiryDateInput = document.getElementById("expiryDate");
const storageSelect = document.getElementById("storage");
const janOutput = document.getElementById("jan");
const cameraToggleBtn = document.getElementById("cameraToggleBtn");

let cameraActive = false;

function getCookpadUrlRaw(text) {
  const encoded = encodeURIComponent(text.trim());
  return `https://cookpad.com/jp/search/${encoded}`;
}

function normalizeItemName(name) {
  const patterns = [
    /国産/g,
    /1玉|1個|1袋|1本|1パック/g,
    /×\s*\d+(個|袋|本|枚)?/g,
    /（.*?）/g,
    /【.*?】/g,
    /[\d\.]+(g|kg|ml|L|個|枚)/g,
    /[\s　]+/g
  ];
  let normalized = name;
  patterns.forEach(p => {
    normalized = normalized.replace(p, " ");
  });
  return normalized.trim();
}

window.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  purchaseDateInput.value = today;
  renderInventory();
});

function toggleCamera() {
  const cameraContainer = document.getElementById("camera");

  if (!cameraActive) {
    startScanner();
    cameraToggleBtn.textContent = "カメラ終了";
    cameraActive = true;
  } else {
    Quagga.offDetected();
    Quagga.stop();
    cameraToggleBtn.textContent = "カメラ起動";
    cameraActive = false;
    janOutput.value += "カメラを停止しました\n";
    cameraContainer.innerHTML = ""; // 映像を消す
  }
}

function startScanner() {
  const cameraContainer = document.getElementById("camera");
  cameraContainer.innerHTML = ""; // 前回の映像を消す

  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: cameraContainer,
      constraints: {
        facingMode: "environment"
      }
    },
    decoder: {
      readers: ["ean_reader", "ean_8_reader"]
    },
    locate: true
  }, function (err) {
    if (err) {
      janOutput.value += "Quagga初期化エラー: " + err + "\n";
      return;
    }
    Quagga.start();

    const adjustCameraSize = () => {
      const videoEl = document.querySelector("#camera video");
      if (videoEl && videoEl.videoWidth && videoEl.videoHeight) {
        const aspectRatio = videoEl.videoHeight / videoEl.videoWidth;
        const width = videoEl.offsetWidth;
        const height = width * aspectRatio;
        cameraContainer.style.height = `${height}px`;
      } else {
        setTimeout(adjustCameraSize, 100);
      }
    };
    adjustCameraSize();
  });

  let lastCode = "";
  let count = 0;
  let hasProcessed = false;

  Quagga.onDetected(data => {
    const code = data.codeResult.code;

    if (code === lastCode) {
      count++;
    } else {
      lastCode = code;
      count = 1;
      hasProcessed = false;
    }

    if (count >= 5 && !hasProcessed) {
      hasProcessed = true;
      Quagga.offDetected();
      Quagga.stop();
      cameraToggleBtn.textContent = "カメラ起動";
      cameraActive = false;
      document.getElementById("camera").innerHTML = ""; // 映像を消す
      janOutput.value += `JANコード: ${code}\n`;
      searchProduct(code);
    }
  });
}

function searchProduct(janCode) {
  const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?applicationId=${appId}&format=json&keyword=${janCode}`;
  fetch(url)
    .then(res => res.json())
    .then(data => {
      if (data.Items && data.Items.length > 0) {
        const rawName = data.Items[0].Item.itemName;
        const cleanedName = normalizeItemName(rawName);
        itemNameInput.value = cleanedName;
        janOutput.value += `商品名: ${cleanedName}（正規化済）を追加しました\n`;
      } else {
        janOutput.value += "商品が見つかりませんでした\n";
      }
    })
    .catch(err => {
      janOutput.value += "APIエラー: " + err.message + "\n";
    });
}

async function addItemManually() {
  const name = itemNameInput.value.trim();
  const purchase = purchaseDateInput.value;
  const expiry = expiryDateInput.value;
  const storage = storageSelect.value;

  if (!name) {
    alert("商品名を入力してください");
    return;
  }

  inventory.push({ name, purchase, expiry, storage });
  saveInventory();
  await renderInventory();
  clearForm();
}

async function renderInventory() {
  inventoryList.innerHTML = "";
  const now = new Date();

  for (let [index, item] of inventory.entries()) {
    const expiryDate = new Date(item.expiry);
    const daysLeft = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
    const storageClass = {
      "冷蔵庫": "fridge",
      "冷凍庫": "freezer",
      "常温": "room"
    }[item.storage] || "";
    const alertClass = item.expiry && daysLeft <= 1 ? "alert" : "";

    const cookpadUrl = getCookpadUrlRaw(item.name);

    const li = document.createElement("li");
    li.className = `${storageClass} ${alertClass}`;
    li.innerHTML = `
      <span>${item.name}（${item.storage} / 購入:${item.purchase} / 期限:${item.expiry || ""}）</span>
      <div class="action-buttons">
        <a href="${cookpadUrl}" target="_blank" class="recipe-btn">レシピ</a>
        <button class="delete-square" onclick="deleteItem(${index})">×</button>
      </div>
    `;
    inventoryList.appendChild(li);
  }
}

function deleteItem(index) {
  inventory.splice(index, 1);
  saveInventory();
  renderInventory();
}

function saveInventory() {
  localStorage.setItem("inventory", JSON.stringify(inventory));
}

function clearForm() {
  itemNameInput.value = "";
  itemNameInput.focus();
  const today = new Date().toISOString().split("T")[0];
  purchaseDateInput.value = today;
  expiryDateInput.value = "";
  storageSelect.value = "冷蔵庫";
}