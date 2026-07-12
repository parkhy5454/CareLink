// 휴대폰 카메라 사진은 용량이 커서, 가장 긴 변을 MAX_DIM 이하로 줄여서
// 업로드 속도와 Gemini 분석 속도를 개선합니다.
const MAX_DIM = 1280

export function resizeImageToBase64(file) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = () => {
      img.onload = () => {
        let { width, height } = img
        if (width > height && width > MAX_DIM) {
          height = Math.round((height * MAX_DIM) / width)
          width = MAX_DIM
        } else if (height > MAX_DIM) {
          width = Math.round((width * MAX_DIM) / height)
          height = MAX_DIM
        }

        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx.drawImage(img, 0, 0, width, height)

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        const base64 = dataUrl.split(',')[1]
        resolve({ base64, mimeType: 'image/jpeg', previewUrl: dataUrl })
      }
      img.onerror = reject
      img.src = reader.result
    }
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}
