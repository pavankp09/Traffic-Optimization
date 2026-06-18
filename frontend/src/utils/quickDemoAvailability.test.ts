import { isQuickDemoEnabled } from './quickDemoAvailability.ts'

if (isQuickDemoEnabled) {
  throw new Error('Quick Demo should be disabled')
}
