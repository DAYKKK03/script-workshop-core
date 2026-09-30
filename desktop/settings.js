const statusEl = document.getElementById("status");
const messageEl = document.getElementById("message");
const form = document.getElementById("form");
const startButton = document.getElementById("start");
const saveButton = document.getElementById("save");
const secretFields = new Set(["DEEPSEEK_API_KEY", "TIKHUB_API_KEY", "VOLCENGINE_ASR_API_KEY", "COS_ACCESS_KEY_ID", "COS_SECRET_ACCESS_KEY"]);

function showError(error) { messageEl.textContent = error?.message || "操作失败"; }
function setBusy(busy) { startButton.disabled = busy; saveButton.disabled = busy; }

window.desktop.get().then((data) => {
  statusEl.textContent = data.status;
  document.getElementById("invite").textContent = data.inviteCode;
  for (const [key, value] of Object.entries(data.providers)) {
    const input = form.elements.namedItem(key);
    if (!input) continue;
    if (secretFields.has(key)) input.placeholder = value || "未配置";
    else input.value = value;
  }
}).catch(showError);
window.desktop.onStatus((value) => { statusEl.textContent = value; });

startButton.addEventListener("click", async () => {
  setBusy(true); messageEl.textContent = "";
  try { await window.desktop.start(); }
  catch (error) { showError(error); }
  finally { setBusy(false); }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault(); setBusy(true); messageEl.textContent = "";
  const values = {};
  for (const input of form.querySelectorAll("input[name]")) {
    if (secretFields.has(input.name)) {
      if (input.value) values[input.name] = input.value;
      else if (form.querySelector(`[data-clear="${input.name}"]`).checked) values[input.name] = "";
    } else values[input.name] = input.value;
  }
  try {
    const result = await window.desktop.save(values);
    for (const key of secretFields) {
      form.elements.namedItem(key).value = "";
      form.elements.namedItem(key).placeholder = result.providers[key] || "未配置";
      form.querySelector(`[data-clear="${key}"]`).checked = false;
    }
    messageEl.textContent = "配置已保存";
  } catch (error) { showError(error); }
  finally { setBusy(false); }
});
