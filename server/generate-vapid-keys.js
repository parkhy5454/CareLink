import webpush from 'web-push'

const keys = webpush.generateVAPIDKeys()

console.log('아래 두 값을 Replit Secrets에 추가해주세요:\n')
console.log(`VAPID_PUBLIC_KEY=${keys.publicKey}`)
console.log(`VAPID_PRIVATE_KEY=${keys.privateKey}`)
console.log('\n(선택) VAPID_SUBJECT=mailto:your-email@example.com')
