const credentialsCount = document.querySelector("#credentialsCount");
const credentialsTableBody = document.querySelector("#credentialsTableBody");
const credentialRowTemplate = document.querySelector("#credentialRowTemplate");
const credentialsStatus = document.querySelector("#credentialsStatus");
const credentialsForm = document.querySelector("#credentialsForm");
const clearCredentialButton = document.querySelector("#clearCredentialButton");
const reloadCredentialsButton = document.querySelector("#reloadCredentialsButton");

let allCredentials = [];

function setStatus(text) {
  if (credentialsStatus) credentialsStatus.textContent = text;
}

function updateCount() {
  if (credentialsCount) credentialsCount.textContent = String(allCredentials.length);
}

function clearForm() {
  if (!credentialsForm) return;
  credentialsForm.id.value = "";
  credentialsForm.app_name.value = "";
  credentialsForm.login_url.value = "";
  credentialsForm.username.value = "";
  credentialsForm.password.value = "";
  credentialsForm.notes.value = "";
}

function fillForm(credential) {
  if (!credentialsForm || !credential) return;
  credentialsForm.id.value = credential.id || "";
  credentialsForm.app_name.value = credential.app_name || "";
  credentialsForm.login_url.value = credential.login_url || "";
  credentialsForm.username.value = credential.username || "";
  credentialsForm.password.value = "";
  credentialsForm.notes.value = credential.notes || "";
}

function render() {
  if (!credentialsTableBody || !credentialRowTemplate) return;
  credentialsTableBody.innerHTML = "";
  allCredentials.forEach((credential) => {
    const row = credentialRowTemplate.content.firstElementChild.cloneNode(true);
    row.querySelector(".cred-app").textContent = credential.app_name || "—";
    row.querySelector(".cred-url").textContent = credential.login_url || "—";
    row.querySelector(".cred-user").textContent = credential.username || "—";
    row.querySelector(".cred-notes").textContent = credential.notes || "—";
    row.querySelector(".cred-status").textContent = credential.has_password ? "Encrypted locally" : "No password";

    const actions = row.querySelector(".cred-actions");
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "secondary tiny";
    editButton.textContent = "Edit";
    editButton.addEventListener("click", () => {
      fillForm(credential);
      setStatus(`Editing ${credential.app_name || "credential"}. Enter a new password only if you want to change it.`);
    });

    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "danger tiny";
    deleteButton.textContent = "Delete";
    deleteButton.addEventListener("click", async () => {
      if (!confirm(`Delete ${credential.app_name || "this credential"}?`)) return;
      await saveCredential({ action: "delete", id: credential.id });
    });

    actions.append(editButton, deleteButton);
    credentialsTableBody.appendChild(row);
  });
  updateCount();
}

async function loadCredentials() {
  setStatus("Loading");
  const response = await fetch("/api/credentials", { credentials: "include" });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  allCredentials = payload.credentials || [];
  setStatus(allCredentials.length ? `${allCredentials.length} saved login(s)` : "No saved logins");
  render();
}

async function saveCredential(extra = {}) {
  setStatus("Saving");
  const response = await fetch("/api/credentials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      action: extra.action || "upsert",
      id: extra.id || credentialsForm.id.value.trim(),
      app_name: credentialsForm.app_name.value.trim(),
      login_url: credentialsForm.login_url.value.trim(),
      username: credentialsForm.username.value.trim(),
      password: extra.password ?? credentialsForm.password.value,
      notes: credentialsForm.notes.value.trim(),
    }),
  });
  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }
  const payload = await response.json();
  allCredentials = payload.credentials || allCredentials;
  setStatus(allCredentials.length ? `${allCredentials.length} saved login(s)` : "No saved logins");
  render();
  clearForm();
}

if (credentialsForm) {
  credentialsForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await saveCredential();
  });
}

clearCredentialButton?.addEventListener("click", clearForm);
reloadCredentialsButton?.addEventListener("click", loadCredentials);

loadCredentials();
