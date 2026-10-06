-- Ejecutar una vez en PostgreSQL antes de iniciar esta version del backend.
-- Es aditivo: no elimina tablas ni modifica los roles de los usuarios.
BEGIN;
ALTER TABLE ave_combatiente_Usuario
    ADD COLUMN IF NOT EXISTS sessionVersion INTEGER DEFAULT 0;

-- Si CAP mantiene un historial de evolucion, registrar solo este campo.
-- Asi un futuro cds deploy no intenta volver a crear la columna manual.
DO $$
BEGIN
    IF to_regclass('cds_model') IS NOT NULL THEN
        EXECUTE $sql$
            UPDATE cds_model
            SET csn = jsonb_set(
                csn::jsonb,
                '{definitions,ave.combatiente.Usuario,elements,sessionVersion}',
                '{"type":"cds.Integer","default":{"val":0},"@cds.persistence.name":"SESSIONVERSION"}'::jsonb,
                true
            )::text
            WHERE csn::jsonb #> '{definitions,ave.combatiente.Usuario,elements}' IS NOT NULL
              AND csn::jsonb #> '{definitions,ave.combatiente.Usuario,elements,sessionVersion}' IS NULL
        $sql$;
    END IF;
END $$;
COMMIT;
