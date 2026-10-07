import { execSync } from 'node:child_process';

/** Build the office UI once (type-check plus vite build into dashboard/dist). */
export default function globalSetup(): void {
  execSync('npm run build', { stdio: 'inherit' });
}
