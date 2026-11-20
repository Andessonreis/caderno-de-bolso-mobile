// Dublê do expo-secure-store para os testes: guarda na memória.
const items = new Map();

export const getItemAsync = (key) => Promise.resolve(items.has(key) ? items.get(key) : null);
export const setItemAsync = (key, value) => {
  items.set(key, value);
  return Promise.resolve();
};
export const deleteItemAsync = (key) => {
  items.delete(key);
  return Promise.resolve();
};
