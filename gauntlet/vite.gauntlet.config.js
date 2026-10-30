// Servidores del Gauntlet (puertos 5181–5184, uno por agente): la misma configuración que `npm run dev:http`, pero sin
// recarga automática. Los agentes editan a la vez; con HMR, cada cambio de uno reiniciaba la tele de prueba de los otros.
// Tras editar, recargar la página a mano.
import { defineConfig, mergeConfig } from 'vite';
import base from '../vite.config.js';

export default defineConfig((env) => mergeConfig(base({ ...env, mode: 'http' }), { server: { hmr: false } }));
