/**
 * 轻量聊天占位：避免主包静态依赖 mock/chat（含大量模拟数据）。
 * 接入真实 IM / WebSocket 时，在此改为 wx.connectSocket、wx.request 等即可。
 */

function createIdleSocketTask() {
  return {
    onOpen() {},
    onMessage() {},
    onClose() {},
    onError() {},
    send() {},
    close() {},
  };
}

export function connectSocket() {
  return createIdleSocketTask();
}

export function fetchUnreadNum() {
  return Promise.resolve({ code: 200, data: 0 });
}

export function fetchMessageList() {
  return Promise.resolve({ code: 200, data: [] });
}

export function markMessagesRead() {}
