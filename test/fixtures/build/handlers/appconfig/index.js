// 验证内置 appConfig 未被同名业务服务覆盖
export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/app-config' }
    ]
  };
}

export default async function () {
  return JSON.stringify({ appRoot: this.appConfig.appRoot });
}
