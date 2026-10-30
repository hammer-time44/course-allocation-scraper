// Clicking the toolbar icon shows/hides the scraper panel on the current tab.
chrome.action.onClicked.addListener(async (tab) => {
  if (tab.id == null) return;
  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'vit-scraper-toggle' });
    chrome.action.setBadgeText({ tabId: tab.id, text: '' });
  } catch (e) {
    // The content script is not in this tab: wrong site, or the tab was open before the extension was installed.
    chrome.action.setBadgeBackgroundColor({ tabId: tab.id, color: '#D9230F' });
    chrome.action.setBadgeText({ tabId: tab.id, text: 'F5' });
    chrome.action.setTitle({ tabId: tab.id, title: 'Open the VIT portal in this tab and press F5 (reload), then click again' });
  }
});
