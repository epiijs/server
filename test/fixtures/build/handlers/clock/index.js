// 读取 clock 服务，用于验证 .mjs 服务模块的注册与命名
export function declare() {
  return {
    routes: [
      { method: 'GET', path: '/clock' }
    ]
  };
}

export default async function () {
  return JSON.stringify(this.clock);
}
