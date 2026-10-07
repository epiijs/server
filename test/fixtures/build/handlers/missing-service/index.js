// 访问未注册的服务名：容器抛 service "notRegistered" not found，由路由兜底
export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/missing-service' }
    ]
  };
}

export default async function () {
  return JSON.stringify({ value: this.notRegistered });
}
