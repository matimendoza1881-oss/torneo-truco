-- Devuelve un JSON por torneo activo con todo lo que necesita agente/calcular.js
select json_build_object(
  'torneo', to_jsonb(t) - 'archivado',
  'jugadores', coalesce((select json_agg(json_build_object('id', j.id, 'nombre', j.nombre) order by j.creado) from public.jugadores j where j.torneo_id = t.id and j.activo), '[]'),
  'partidos', coalesce((select json_agg(to_jsonb(p)) from public.partidos p where p.torneo_id = t.id), '[]'),
  'ultima_carga', (select max(c.cuando) from public.cargas c where c.torneo_id = t.id),
  'ultimo_parte', (select max(r.creado) from public.resumenes r where r.torneo_id = t.id)
) as datos
from public.torneos t
where not t.archivado
order by t.creado desc;
