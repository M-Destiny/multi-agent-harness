import { SandboxRegistry } from './sandbox.js';
import { DockerSandboxProvider } from './docker-provider.js';
import { E2BSandboxProvider } from './e2b-provider.js';
import { ModalSandboxProvider } from './modal-provider.js';

SandboxRegistry.register('docker', new DockerSandboxProvider());
SandboxRegistry.register('e2b', new E2BSandboxProvider());
SandboxRegistry.register('modal', new ModalSandboxProvider());

export * from './sandbox.js';
export { DockerSandboxProvider } from './docker-provider.js';
export { E2BSandboxProvider } from './e2b-provider.js';
export { ModalSandboxProvider } from './modal-provider.js';
