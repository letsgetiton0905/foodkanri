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
  return `https://cookpad.com/search/${encodeURIComponent(text.trim())}`;
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
  patterns.forEach(p => normalized = normalized.replace(p, " "));
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
    cameraContainer.innerHTML = "";
  }
}

function startScanner() {
  const cameraContainer = document.getElementById("camera");
  cameraContainer.innerHTML = "";

  Quagga.init({
    inputStream: { name: "Live", type: "LiveStream", target: cameraContainer, constraints: { facingMode: "environment" } },
    decoder: { readers: ["ean_reader","ean_8_reader"] },
    locate: true
  }, function(err) {
    if(err){ janOutput.value += "Quagga初期化エラー: " + err + "\n"; return; }
    Quagga.start();
  });

  let lastCode = "", count = 0, hasProcessed = false;

  Quagga.onDetected(data => {
    const code = data.codeResult.code;
    if (code === lastCode) count++; else { lastCode = code; count = 1; hasProcessed = false; }
    if (count >= 5 && !hasProcessed) {
      hasProcessed = true;
      Quagga.offDetected();
      Quagga.stop();
      cameraToggleBtn.textContent = "カメラ起動";
      cameraActive = false;
      cameraContainer.innerHTML = "";
      janOutput.value += `JANコード: ${code}\n`;
      searchProduct(code);
    }
  });
}

function searchProduct(janCode) {
  const url = `https://app.rakuten.co.jp/services/api/IchibaItem/Search/20220601?applicationId=${appId}&format=json&keyword=${janCode}`;
  fetch(url).then(res => res.json()).then(data => {
    if(data.Items && data.Items.length > 0){
      const rawName = data.Items[0].Item.itemName;
      const cleanedName = normalizeItemName(rawName);
      itemNameInput.value = cleanedName;
      janOutput.value += `商品名: ${cleanedName}（正規化済）を追加しました\n`;
    } else { janOutput.value += "商品が見つかりませんでした\n"; }
  }).catch(err => janOutput.value += "APIエラー: " + err.message + "\n");
}

async function addItemManually() {
  const name = itemNameInput.value.trim();
  const purchase = purchaseDateInput.value;
  const expiry = expiryDateInput.value;
  const storage = storageSelect.value;
  if(!name){ alert("商品名を入力してください"); return; }

  inventory.push({name,purchase,expiry,storage});
  saveInventory();
  await renderInventory();
  clearForm();
}

function getSelectedIndexes() {
  const checkboxes = document.querySelectorAll(".itemCheckbox");
  let selected = [];
  checkboxes.forEach(cb => { if(cb.checked) selected.push(parseInt(cb.dataset.index)); });
  return selected;
}

function updateMultiActions() {
  const selected = getSelectedIndexes();
  const multiActions = document.getElementById("multiActions");
  multiActions.style.display = selected.length > 0 ? "block" : "none";
}

async function renderInventory() {
  inventoryList.innerHTML = "";
  const now = new Date();

  for(let [index,item] of inventory.entries()){
    const expiryDate = new Date(item.expiry);
    const daysLeft = Math.ceil((expiryDate - now)/(1000*60*60*24));
    const storageClass = {"冷蔵庫":"fridge","冷凍庫":"freezer","常温":"room"}[item.storage]||"";
    const alertClass = item.expiry && daysLeft <= 1 ? "alert":"";
    const cookpadUrl = getCookpadUrlRaw(item.name);

    const li = document.createElement("li");
    li.className = `${storageClass} ${alertClass}`;

    li.innerHTML = `
      <span>${item.name}（${item.storage} / 購入:${item.purchase} / 期限:${item.expiry || ""}）</span>
      <div class="action-buttons">
        <a href="${cookpadUrl}" target="_blank" class="recipe-btn">レシピ</a>
        <button class="delete-square" onclick="deleteItem(${index})">×</button>
        <label style="display:flex; align-items:center; gap:0.3em; margin-left:0.5em;">
          <input type="checkbox" class="itemCheckbox" data-index="${index}">
        </label>
      </div>
    `;
    inventoryList.appendChild(li);

    li.querySelector(".itemCheckbox").addEventListener("change", updateMultiActions);
  }

  updateMultiActions();
}

function deleteItem(index){
  inventory.splice(index,1);
  saveInventory();
  renderInventory();
}

function deleteSelectedItems(){
  let selected = getSelectedIndexes();
  if(selected.length === 0){ alert("削除する項目を選択してください"); return; }
  selected.sort((a,b)=>b-a).forEach(idx=>inventory.splice(idx,1));
  saveInventory();
  renderInventory();
}

function searchRecipesForSelected(){
  let selected = getSelectedIndexes();
  if(selected.length===0){ alert("レシピ検索する項目を選択してください"); return; }
  const keywords = selected.map(idx=>inventory[idx].name).join(" ");
  const url = getCookpadUrlRaw(keywords);
  window.open(url,"_blank");
}

function saveInventory(){ localStorage.setItem("inventory",JSON.stringify(inventory)); }

function clearForm(){
  itemNameInput.value = "";
  itemNameInput.focus();
  purchaseDateInput.value = new Date().toISOString().split("T")[0];
  expiryDateInput.value = "";
  storageSelect.value = "冷蔵庫";
}
