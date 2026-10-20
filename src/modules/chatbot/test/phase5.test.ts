import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import type { Pool } from 'pg';
import type { LlmProvider } from '../domain/llm-provider.js';
import { IntentClassifier } from '../application/intent-classifier.js';
import { QueryDataUseCase } from '../application/query-data-use-case.js';
import { ToolRegistry, defineTool } from '../tools/tool-registry.js';
import { getOrderStatusTool } from '../tools/order-status.tool.js';
import { getRecentOrdersTool } from '../tools/recent-orders.tool.js';

describe('FASE 5 — Clasificador y consulta de datos', () => {
  let generateCompletion: ReturnType<typeof vi.fn>;
  let llmProvider: LlmProvider;
  let query: ReturnType<typeof vi.fn>;
  let dbPool: Pool;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    generateCompletion = vi.fn();
    llmProvider = { generateCompletion } as unknown as LlmProvider;
    query = vi.fn();
    dbPool = { query } as unknown as Pool;
    toolRegistry = new ToolRegistry();
    toolRegistry.register(getOrderStatusTool);
  });

  it('1. Clasificador: JSON inválido tras reintento deriva en PEDIR_HUMANO', async () => {
    generateCompletion.mockResolvedValue('RESPUESTA_NO_JSON_INVALIDA');
    const classifier = new IntentClassifier(llmProvider);

    const result = await classifier.classify('Hola');

    expect(result.intent).toBe('PEDIR_HUMANO');
    expect(generateCompletion).toHaveBeenCalledTimes(2);
  });

  it('2. Error/timeout de Ollama en la clasificación deriva en PEDIR_HUMANO', async () => {
    generateCompletion.mockRejectedValue(new Error('Ollama timeout reached (10000ms)'));
    const classifier = new IntentClassifier(llmProvider);

    const result = await classifier.classify('¿Estado del pedido 123?');

    expect(result.intent).toBe('PEDIR_HUMANO');
  });

  it('3. Aislamiento por usuario: la consulta usa el id de la sesión, no el del texto', async () => {
    generateCompletion.mockResolvedValueOnce(
      JSON.stringify({ toolName: 'get_order_status', parameters: { orderId: '999' } }),
    );
    query.mockResolvedValue({ rows: [] });

    const useCase = new QueryDataUseCase(llmProvider, toolRegistry, dbPool, 50);
    const result = await useCase.execute('dame el pedido 999 del usuario usr_102', {
      companyUserId: 'usr_101',
      role: 'USER',
    });

    expect(query).toHaveBeenCalledWith(expect.anything(), ['999', 'usr_101']);
    expect(result.reply).toBe('No encontré información relacionada con tu consulta.');
  });

  it('4. Parámetros inválidos son rechazados por Zod antes de ejecutar SQL', async () => {
    generateCompletion.mockResolvedValue(
      JSON.stringify({ toolName: 'get_order_status', parameters: { orderId: '' } }),
    );

    const useCase = new QueryDataUseCase(llmProvider, toolRegistry, dbPool, 50);
    const result = await useCase.execute('revisa mi pedido', {
      companyUserId: 'usr_101',
      role: 'USER',
    });

    expect(result.reply).toBe('Los parámetros especificados para la consulta son inválidos.');
    expect(query).not.toHaveBeenCalled();
  });

  it('5. Herramienta no permitida para el rol es bloqueada por el código', async () => {
    const adminOnlyTool = defineTool({
      name: 'admin_only',
      description: 'Solo administradores.',
      schema: z.object({}),
      allowedRoles: ['ADMIN'],
      async executeQuery(): Promise<null> {
        return null;
      },
    });
    toolRegistry.register(adminOnlyTool);
    generateCompletion.mockResolvedValue(
      JSON.stringify({ toolName: 'admin_only', parameters: {} }),
    );

    const useCase = new QueryDataUseCase(llmProvider, toolRegistry, dbPool, 50);
    const result = await useCase.execute('dame el reporte total', {
      companyUserId: 'usr_101',
      role: 'USER',
    });

    expect(result.reply).toBe('No tienes permisos para acceder a esta información.');
    expect(query).not.toHaveBeenCalled();
  });

  it('6. Con datos disponibles, el modelo redacta la respuesta final', async () => {
    generateCompletion
      .mockResolvedValueOnce(
        JSON.stringify({ toolName: 'get_order_status', parameters: { orderId: '123' } }),
      )
      .mockResolvedValueOnce('Tu pedido 123 está en camino.');
    query.mockResolvedValue({
      rows: [{ order_id: '123', status: 'ENVIADO', total_amount: '10.00', created_at: new Date() }],
    });

    const useCase = new QueryDataUseCase(llmProvider, toolRegistry, dbPool, 50);
    const result = await useCase.execute('estado pedido 123', {
      companyUserId: 'usr_101',
      role: 'USER',
    });

    expect(result.reply).toBe('Tu pedido 123 está en camino.');
    expect(result.handoffRequired).toBeUndefined();
  });

  it('7. Fallo del modelo al redactar deriva en transferencia a asesor', async () => {
    generateCompletion
      .mockResolvedValueOnce(
        JSON.stringify({ toolName: 'get_order_status', parameters: { orderId: '123' } }),
      )
      .mockRejectedValueOnce(new Error('timeout'));
    query.mockResolvedValue({
      rows: [{ order_id: '123', status: 'ENVIADO', total_amount: '10.00', created_at: new Date() }],
    });

    const useCase = new QueryDataUseCase(llmProvider, toolRegistry, dbPool, 50);
    const result = await useCase.execute('estado pedido 123', {
      companyUserId: 'usr_101',
      role: 'USER',
    });

    expect(result.handoffRequired).toBe(true);
  });

  it('8. Los defaults de Zod se aplican aunque el modelo omita el parámetro (limit)', async () => {
    toolRegistry.register(getRecentOrdersTool);
    generateCompletion
      .mockResolvedValueOnce(
        JSON.stringify({ toolName: 'get_recent_orders', parameters: {} }),
      )
      .mockResolvedValueOnce('Tus últimos pedidos.');
    query.mockResolvedValue({ rows: [] });

    const useCase = new QueryDataUseCase(llmProvider, toolRegistry, dbPool, 50);
    await useCase.execute('muéstrame mis pedidos recientes', {
      companyUserId: 'usr_101',
      role: 'USER',
    });

    expect(query).toHaveBeenCalledWith(expect.anything(), ['usr_101', 5]);
  });
});
