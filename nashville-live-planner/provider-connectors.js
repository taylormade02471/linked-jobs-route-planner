/* provider-connectors.js — safe metadata-only provider connection stubs */
(function registerProviderConnectors(root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ProviderConnectors = api;
})(typeof window !== 'undefined' ? window : globalThis, function providerConnectorsFactory() {
  // No raw credentials are stored — only connection status metadata
  const PROVIDERS = [
    { id: 'survey_merchandiser', label: 'Survey Merchandiser', domain: 'survey.com', androidPackage: 'iSurvey.Android' },
    { id: 'clickworker', label: 'Clickworker', domain: 'clickworker.com', androidPackage: 'com.clickworker.clickworkerapp' },
    { id: 'field_nation', label: 'Field Nation', domain: 'fieldnation.com', androidPackage: 'com.fieldnation.android' },
    { id: 'field_agent', label: 'Field Agent', domain: 'fieldagent.net', androidPackage: 'net.fieldagent' },
  ];

  function getProviders() { return PROVIDERS; }
  function getProvider(id) { return PROVIDERS.find(p => p.id === id) || null; }

  return { getProviders, getProvider };
});
