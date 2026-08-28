export const AppState = {
  meta: {
    sourceGeneratedAt: '',
    lastSuccessfulLoadAt: '',
    publicSuppression: null
  },

  data: {
    villages: [],
    waterSystems: [],
    waterSources: []
  },

  filtered: {
    villages: [],
    waterSystems: [],
    waterSources: []
  },

  filters: {
    search: '',
    district: '',
    localAuthority: '',
    systemType: '',
    operationalStatus: '',
    drinkingWaterQuality: '',
    waterQuantity: ''
  }
};
