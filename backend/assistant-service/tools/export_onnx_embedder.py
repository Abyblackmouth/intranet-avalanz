# ----------------------------------------------------------------------
# Exportacion de un modelo de embeddings a ONNX
# Descarga el modelo de Hugging Face, lo exporta a ONNX (fp32), lo
# cuantiza a int8 y guarda el tokenizador y un manifiesto. Se corre una
# vez por modelo, en un contenedor temporal con PyTorch; produccion solo
# necesita los archivos resultantes. Uso:
#   python -m tools.export_onnx_embedder intfloat/multilingual-e5-small /modelos/e5-small
# ----------------------------------------------------------------------

# ----------------------------------------------------------------------
# Importaciones
# ----------------------------------------------------------------------
import json
import sys
from datetime import datetime
from pathlib import Path

import torch
from onnxruntime.quantization import QuantType, quantize_dynamic
from transformers import AutoModel, AutoTokenizer

model_id = sys.argv[1]
output = Path(sys.argv[2])
output.mkdir(parents=True, exist_ok=True)

# ----------------------------------------------------------------------
# Tokenizador: tokenizer.json es lo unico que necesita produccion
# ----------------------------------------------------------------------
tokenizer = AutoTokenizer.from_pretrained(model_id)
tokenizer.save_pretrained(output)

# ----------------------------------------------------------------------
# Exportacion a ONNX con ejes dinamicos (lote y longitud variables)
# ----------------------------------------------------------------------
model = AutoModel.from_pretrained(model_id).eval()
sample = tokenizer(["query: ejemplo de exportacion"], return_tensors="pt")
torch.onnx.export(
    model, (sample["input_ids"], sample["attention_mask"]), str(output / "model.onnx"),
    input_names=["input_ids", "attention_mask"], output_names=["last_hidden_state"],
    dynamic_axes={"input_ids": {0: "batch", 1: "tokens"}, "attention_mask": {0: "batch", 1: "tokens"},
                  "last_hidden_state": {0: "batch", 1: "tokens"}},
    opset_version=17,
)

# ----------------------------------------------------------------------
# Cuantizacion dinamica: pesos de 32 a 8 bits
# ----------------------------------------------------------------------
quantize_dynamic(str(output / "model.onnx"), str(output / "model_int8.onnx"), weight_type=QuantType.QInt8)

# ----------------------------------------------------------------------
# Manifiesto: de donde salio el modelo y cuanto pesa
# ----------------------------------------------------------------------
sizes = {f.name: round(f.stat().st_size / 1048576, 1) for f in output.glob("*.onnx")}
(output / "manifest.json").write_text(json.dumps({
    "model_id": model_id, "exported": datetime.now().isoformat(timespec="seconds"),
    "hidden_size": model.config.hidden_size, "files_mb": sizes,
}, indent=2), encoding="utf-8")
print(f"EXPORTADO: {model_id} | archivos_mb={sizes}", flush=True)
