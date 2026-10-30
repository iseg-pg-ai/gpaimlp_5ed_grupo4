// Decisão da guarda do portal, sem SDK para poder ser testada: liga de novo a instância indicada
// quando ela pára, salvo se tiver a etiqueta blu-keep-stopped=true.
export function createGuard({ instanceId, describe, start }) {
  return async event => {
    const id = event?.detail?.['instance-id'];
    if (id !== instanceId || event?.detail?.state !== 'stopped') return { skipped: 'other instance or state' };
    const instance = await describe(id);
    if (instance?.Tags?.some(tag => tag.Key === 'blu-keep-stopped' && tag.Value === 'true')) return { skipped: 'blu-keep-stopped' };
    await start(id);
    console.log(JSON.stringify({ guard: 'started', instance: id, stoppedReason: instance?.StateTransitionReason ?? '' }));
    return { started: id };
  };
}
