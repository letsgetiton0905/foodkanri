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

/* Cookpad検索URL生成 */
function getCookpadUrlRaw(text) {
  const encoded = encodeURIComponent(text.trim());
  return `https://cookpad.com/search/${encoded}`;
}

/* 商品名の正規化 */
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
  patterns.forEach(p => normalized = normalized.replace(p, " "));
  return normalized.trim();
}

/* 初期化 */
window.addEventListener("DOMContentLoaded", () => {
  const today = new Date().toISOString().split("T")[0];
  purchaseDateInput.value = today;
  renderInventory();
});

/* カメラ ON/OFF */
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
    cameraContainer.innerHTML = "";
  }
}

/* Quagga 初期化 */
function startScanner() {
  const cameraContainer = document.getElementById("camera");
  cameraContainer.innerHTML = "";

  Quagga.init({
    inputStream: {
      name: "Live",
      type: "LiveStream",
      target: cameraContainer,
      constraints: { facingMode: "environment" }
    },
    decoder: { readers: ["ean_reader", "ean_8_reader"] },
    locate: true
  }, function (err) {
    if (err) {
      janOutput.value += "Quagga初期化エラー: " + err + "\n";
      return;
    }
    Quagga.start();
  });

  let lastCode = "";
  let count = 0;
  let hasProcessed = false;

  Quagga.onDetected(data => {
    const code = data.codeResult.code;

    if (code === lastCode) count++;
    else { lastCode = code; count = 1; hasProcessed = false; }

    if (count >= 5 && !hasProcessed) {
      hasProcessed = true;
      Quagga.offDetected();
      Quagga.stop();
      cameraToggleBtn.textContent = "カメラ起動";
      cameraActive = false;
      document.getElementById("camera").innerHTML = "";
      janOutput.value += `JANコード: ${code}\n`;
      searchProduct(code);
    }
  });
}

/* API 商品検索 */
function searchProduct(janCode) {
  const url =
    `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?applicationId=${appId}&format=json&keyword=${janCode}`;

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
    .catch(err => janOutput.value += "APIエラー: " + err.message + "\n");
}

/* 手動追加 */
async function addItemManually() {
  const name = itemNameInput.value.trim();
  const purchase = purchaseDateInput.value;
  const expiry = expiryDateInput.value;
  const storage = storageSelect.value;

  if (!name) { alert("商品名を入力してください"); return; }

  inventory.push({ name, purchase, expiry, storage });
  saveInventory();
  await renderInventory();
  clearForm();
}

/* 選択 index の取得 */
function getSelectedIndexes() {
  const checkboxes = document.querySelectorAll(".itemCheckbox");
  let selected = [];
  checkboxes.forEach(cb => { if (cb.checked) selected.push(parseInt(cb.dataset.index)); });
  return selected;
}

/* 一括操作ボタン表示制御 */
function updateMultiActions() {
  const selected = getSelectedIndexes();
  const multiActions = document.getElementById("multiActions");
  multiActions.style.display = selected.length > 0 ? "block" : "none";
}

/* 在庫描画（チェックボックス付） */
async function renderInventory() {
  inventoryList.innerHTML = "";
  const now = new Date();

  for (let [index, item] of inventory.entries()) {
    const expiryDate = new Date(item.expiry);
    const daysLeft = Math.ceil((expiryDate - now) / (1000*60*60*24));

    const storageClass = { "冷蔵庫": "fridge", "冷凍庫": "freezer", "常温": "room" }[item.storage] || "";
    const alertClass = item.expiry && daysLeft <= 1 ? "alert" : "";
    const cookpadUrl = getCookpadUrlRaw(item.name);

    const li = document.createElement("li");
    li.className = `${storageClass} ${alertClass}`;

    li.innerHTML = `
      <label style="display:flex; align-items:center; gap:0.5em;">
        <input type="checkbox" class="itemCheckbox" data-index="${index}">
        <span>${item.name}（${item.storage} / 購入:${item.purchase} / 期限:${item.expiry || ""}）</span>
      </label>
      <div class="action-buttons">
        <a href="${cookpadUrl}" target="_blank" class="recipe-btn">レシピ</a>
        <button class="delete-square" onclick="deleteItem(${index})">×</button>
      </div>
    `;
    inventoryList.appendChild(li);

    // チェックボックス変更時にボタン表示更新
    li.querySelector(".itemCheckbox").addEventListener("change", updateMultiActions);
  }

  updateMultiActions();
}

/* 単品削除 */
function deleteItem(index) {
  inventory.splice(index, 1);
  saveInventory();
  renderInventory();
}

/* 一括削除 */
function deleteSelectedItems() {
  let selected = getSelectedIndexes();
  if (selected.length === 0) { alert("削除する項目を選択してください"); return; }

  selected.sort((a,b) => b-a);
  for (let idx of selected) inventory.splice(idx,1);
  saveInventory();
  renderInventory();
}

/* 一括レシピ検索（複数食材をまとめて検索） */
function searchRecipesForSelected() {
  let selected = getSelectedIndexes();
  if (selected.length === 0) { alert("レシピ検索する項目を選択してください"); return; }

  const keywords = selected.map(idx => inventory[idx].name).join(" ");
  const url = getCookpadUrlRaw(keywords);
  window.open(url, "_blank");
}

/* 保存 */
function saveInventory() {
  localStorage.setItem("inventory", JSON.stringify(inventory));
}

/* 入力フォームリセット */
function clearForm() {
  itemNameInput.value = "";
  itemNameInput.focus();
  const today = new Date().toISOString().split("T")[0];
  purchaseDateInput.value = today;
  expiryDateInput.value = "";
  storageSelect.value = "冷蔵庫";
}
