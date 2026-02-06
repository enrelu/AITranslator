document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('saveBtn').addEventListener('click', saveOptions);

function saveOptions() {
    const apiKey = document.getElementById('apiKey').value.trim();
    const model = document.getElementById('modelSelect').value;
    const tone = document.getElementById('toneSelect').value;
    const autoReplace = document.getElementById('autoReplace').checked;

    chrome.storage.sync.set({
        geminiApiKey: apiKey,
        geminiModel: model,
        geminiTone: tone,
        geminiAutoReplace: autoReplace
    }, () => {
        const status = document.getElementById('status');
        status.textContent = 'Saved!';
        setTimeout(() => { status.textContent = ''; }, 1500);
    });
}

function restoreOptions() {
    chrome.storage.sync.get({
        geminiApiKey: '',
        geminiModel: 'gemini-1.5-flash',
        geminiTone: 'professional',
        geminiAutoReplace: false
    }, (items) => {
        document.getElementById('apiKey').value = items.geminiApiKey;
        document.getElementById('modelSelect').value = items.geminiModel;
        document.getElementById('toneSelect').value = items.geminiTone;
        document.getElementById('autoReplace').checked = items.geminiAutoReplace;
    });
}

document.getElementById('shortcutLink').addEventListener('click', (e) => {
    e.preventDefault();
    chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});
