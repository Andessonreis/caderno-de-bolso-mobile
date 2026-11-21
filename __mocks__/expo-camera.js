// Dublê do expo-camera para os testes. `dubleCamera` deixa o teste escolher a
// resposta do pedido de permissão e simular a leitura de um código. Fica em
// globalThis porque as telas podem carregar outra cópia deste módulo.
globalThis.dubleCamera ??= { permissao: { granted: false, canAskAgain: false, status: 'denied' }, props: null };
export const dubleCamera = globalThis.dubleCamera;
export const CameraView = (props) => {
  globalThis.dubleCamera.props = props;
  return null;
};
export const useCameraPermissions = () => [
  { granted: false, canAskAgain: true, status: 'undetermined' },
  () => Promise.resolve(globalThis.dubleCamera.permissao),
];
