document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);
document.getElementById('checkBtn').addEventListener('click', checkModels);

function saveOptions() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const modelName = document.getElementById('modelName').value.trim() || 'gemini-1.5-flash';

    chrome.storage.sync.set({
        geminiApiKey: apiKey,
        geminiModel: modelName
    }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Settings saved.';
        status.className = 'status show';
        setTimeout(() => { status.className = 'status'; }, 2000);
    });
}

function restoreOptions() {
    chrome.storage.sync.get({
        geminiApiKey: '',
        geminiModel: 'gemini-1.5-flash'
    }, (items) => {
        document.getElementById('apiKey').value = items.geminiApiKey;
        document.getElementById('modelName').value = items.geminiModel;
    });
}

async function checkModels() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const out = document.getElementById('debugOutput');
    out.style.display = 'block';
    out.textContent = 'Fetching models...';

    if (!apiKey) {
        out.textContent = 'Please enter an API Key first.';
        return;
    }

    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
        const data = await response.json();

        if (data.error) {
            out.textContent = 'Error: ' + data.error.message;
        } else if (data.models) {
            const names = data.models.map(m => m.name.replace('models/', ''));
            out.textContent = 'Available Models:\n' + names.join('\n');

            // Auto-suggest logic if current is invalid?
            // For now just show list.
        } else {
            out.textContent = 'No models found or unexpected response.';
        }
    } catch (e) {
        out.textContent = 'Network/Fetch Error: ' + e.message;
    }
}
