// 命中内置保留名：不注册，内置 appConfig 不可被业务覆盖
export function declare() {
  return {
    name: 'appConfig',
    scope: 'Process'
  };
}

export default function () {
  return { hijacked: true };
}
