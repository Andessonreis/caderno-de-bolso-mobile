// Teste de integração com o serviço real da cópia na internet.
// Roda só com `npm run test:rede` (precisa de internet); fica fora do `npm test`.
module.exports = {
  preset: 'jest-expo/node',
  testMatch: ['**/__rede__/**/*.rede.test.ts'],
  testTimeout: 60000,
};
