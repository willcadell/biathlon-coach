"""Exports a trained hole-finding network to ONNX, for the browser, and checks it against PyTorch.

    ml/.venv/bin/python ml/export_onnx.py final-v2 hole-finder-v2

Reads ml/runs/<weights>.pt and writes public/models/<name>.onnx. The model takes a rectified grayscale target,
shape (1, 1, H, W) with H and W multiples of 8, already normalised as (pixel / 255 - 0.5) / 0.25, and returns logits
at half resolution, shape (1, 1, H / 2, W / 2). The sigmoid, the peak-finding and the conversion to millimetres are
done by the caller (src/lib/holeModel.ts), exactly as ml/train.py does them.

The file name carries the model's version because the app's service worker serves cached files without rechecking.
"""
import os, sys, json
import numpy as np
import torch

sys.path.insert(0, 'ml')
from train import Net, load, predict, DEV  # noqa: E402


def main():
    weights, name = sys.argv[1], sys.argv[2]
    net = Net()
    net.load_state_dict(torch.load(f'ml/runs/{weights}.pt', map_location='cpu'))
    net.eval()
    os.makedirs('public/models', exist_ok=True)
    out = f'public/models/{name}.onnx'
    dummy = torch.zeros(1, 1, 672, 672)
    torch.onnx.export(
        net, dummy, out, input_names=['image'], output_names=['logits'], opset_version=17,
        dynamic_axes={'image': {2: 'h', 3: 'w'}, 'logits': {2: 'h2', 3: 'w2'}}, dynamo=False,
    )
    print(f'wrote {out} ({os.path.getsize(out) / 1e6:.2f} MB)')

    # Check: the ONNX model must give the same answer as PyTorch on real rectified images.
    import onnxruntime as ort
    sess = ort.InferenceSession(out, providers=['CPUExecutionProvider'])
    man = json.load(open('ml/data/manifest.json'))
    worst = 0.0
    for it in [i for i in man['items'] if i['auto']][:4]:
        img = load(it['auto']['image'])
        H, W = img.shape
        x = torch.from_numpy((img - 0.5) / 0.25)[None, None]
        x = torch.nn.functional.pad(x, (0, (-W) % 8, 0, (-H) % 8), mode='replicate')
        with torch.no_grad():
            ref = net(x).numpy()
        got = sess.run(None, {'image': x.numpy()})[0]
        worst = max(worst, float(np.abs(ref - got).max()))
    print(f'largest difference in the logits between PyTorch and ONNX over 4 targets: {worst:.2e}')
    assert worst < 1e-3, 'the exported model does not match'


if __name__ == '__main__':
    main()
