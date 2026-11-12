import { afterAll } from 'vitest';
import { releaseTestDevice } from '../src/gpu/testDevice';

afterAll(async () => {
  await releaseTestDevice();
});
