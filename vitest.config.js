import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    hookTimeout: 20000,
    // 모든 테스트가 같은 Postgres 테스트 DB를 공유하고 매 테스트마다 TRUNCATE하기 때문에,
    // 파일을 병렬로 돌리면 서로 데이터를 지워버릴 수 있어요. 순차 실행으로 고정합니다.
    fileParallelism: false
  }
})
