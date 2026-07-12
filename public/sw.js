// 웹 푸시 알림을 받아서 화면에 표시하는 서비스 워커입니다.
self.addEventListener('push', (event) => {
  let data = { title: '내건강', body: '새 알림이 있어요' }
  try {
    if (event.data) data = event.data.json()
  } catch {
    // JSON이 아니면 기본 문구를 사용
  }

  event.waitUntil(
    self.registration.showNotification(data.title || '내건강', {
      body: data.body || '',
      tag: 'naegeongang-notification'
    })
  )
})

// 알림을 클릭하면 앱 탭을 포커스하거나 새로 엽니다.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) return client.focus()
      }
      if (clients.openWindow) return clients.openWindow('/')
    })
  )
})
