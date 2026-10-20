# Manual · Flujos

Un **flujo** es un tipo de documento que se aprueba (Solicitud de compra directa, Alta de cliente…). Aquí se define quién aprueba, en qué orden y para qué empresa.

**Quién**: administrador o diseñador del módulo (auditoría solo ve). **Dónde**: Workflows → Flujos.

## 1. Crear el flujo

1. **Nuevo flujo**.
2. Datos:

| Campo | Qué es | Ejemplo |
|---|---|---|
| Plataforma | La conexión de donde vienen los documentos | TOTVS Protheus 25 – Desarrollo |
| Nombre | Como lo verán los usuarios | `Alta de cliente` |
| processId | Identificador que manda Protheus; **debe ser idéntico** al de los fuentes (mayúsculas incluidas) | `AltaCliente` |
| resultService | Servicio REST de Protheus que recibe el resultado | `WFA1RESULT` |

3. Al crearlo se abre su detalle con las pestañas **Grupos de aprobación · Hoja · Simular · Datos generales · Versiones**.

## 2. Grupos de aprobación

![Cómo se elige el grupo y las etapas](../img/arquitectura/04-grupos-y-etapas.png)

Un grupo es **una cascada de etapas para una empresa**. Cada empresa necesita al menos un grupo **default**, que aplica a cualquier solicitante de esa empresa que no sea miembro de otro grupo.

**Nuevo grupo**:

| Campo | Qué es |
|---|---|
| Nombre | Por ejemplo `General AGIM` o `Supervisores de planta` |
| Empresa | Clave de la plataforma (`02\|01`); se eligen de las empresas de la conexión |
| Si el solicitante es aprobador de una etapa de su propia cascada | **Omitir su etapa** (pasa a la siguiente) o **Subir al siguiente nivel** |
| Grupo default | Encendido para el grupo general de la empresa (solo puede haber uno por empresa) |

**Miembros** (solo en grupos no default): *Agregar miembro* → busca al solicitante. Un solicitante solo puede ser miembro de un grupo por empresa. Así un supervisor puede tener una cascada distinta que un auxiliar.

Si una empresa no tiene grupo default activo, aparece un aviso: los trámites de quien no sea miembro de un grupo nacerán en **error de configuración** (TI recibe aviso y, al corregir, los reprocesa desde Seguimiento).

## 3. Etapas

Las etapas se ven como un **riel** de izquierda a derecha. El **＋** agrega una al final; clic en una etapa para editarla, moverla (↑ ↓) o eliminarla.

| Campo | Qué es |
|---|---|
| Nombre de la etapa | `Gerente de compras`, `Dirección` |
| Puesto esperado | Informativo (se muestra en el riel) |
| Aprobador | Usuario de la Intranet (búscalo por nombre o correo). La aprobación es por **persona** |
| Suplente | Opcional: recibe el aviso también y decide el primero que responda |
| Tipo | *Aprobación*, *Revisión* o *Notificación* (solo avisa y sigue) |
| Condición | Vacío = siempre aplica. Con condición, la etapa solo entra si se cumple: `total > 100000`, `moneda == USD` |
| Comentario obligatorio al rechazar | Encendido por defecto |

Condiciones: `campo operador valor`, con `>`, `<`, `>=`, `<=`, `==`, `!=`. El campo es una clave de los datos que manda Protheus. Si la condición está mal escrita o el dato no viene, la etapa **se omite** y el trámite lo dice (nunca aprueba por error).

## 4. Simular

Antes de usar un flujo, prueba qué haría el motor: elige **empresa**, **solicitante** (vacío = alguien sin grupo propio), el **total** y, si quieres, otros datos en JSON (`{"moneda": "USD"}`). El simulador muestra qué grupo se usa, qué etapas aplican y cuáles se omiten y a quién le llegaría el primer aviso. No crea nada ni manda correos.

## 5. Datos generales

Nombre, processId, resultService, aliases (otros processId que también entran a este flujo), descripción, y el **resumen** (hasta 4 campos que se muestran como columnas en las tablas de trámites). Si cambias el processId y ya hay trámites, el anterior se conserva como alias para que los envíos viejos sigan entrando.

El interruptor **Activo** (arriba a la derecha) detiene el flujo: Protheus recibirá un error si manda documentos.

## 6. Versiones

Cada cambio (grupos, etapas, datos, hoja) crea una **versión**. Los trámites recuerdan con qué versión nacieron: cambiar el flujo hoy no altera los que ya están en aprobación.

## Para que un flujo funcione

1. Flujo creado con el processId y resultService correctos y **activo**.
2. Un grupo **default** con al menos una etapa en cada empresa que vaya a mandar documentos.
3. En Protheus, los fuentes del flujo compilados, sus parámetros y el servicio REST reiniciado.
4. La **Hoja** configurada (ver el manual de la Hoja) para que el aprobador vea el documento bien presentado.
