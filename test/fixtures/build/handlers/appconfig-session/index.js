// 报告本次请求解析到的 appConfig 是否为被劫持形态
export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/app-config-session' }
    ]
  };
}

export default async function () {
  return JSON.stringify({ hijacked: 'hijacked' in this.appConfig });
}
