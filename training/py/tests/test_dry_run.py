import json
import runpy
from unittest.mock import patch
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class Plans(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(dir=ROOT / "tests")
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.base = self.root / 'base'
        self.data = self.root / 'data'
        self.adapter = self.root / 'adapter'
        for path in (self.base, self.data, self.adapter):
            path.mkdir()
        (self.base / 'tokenizer_config.json').write_text(json.dumps({'chat_template': '{{ messages }}'}))
        row = {'messages': [{'role': 'user', 'content': 'hello'}, {'role': 'assistant', 'content': 'hi'}]}
        for split in ('train', 'valid'):
            (self.data / (split + '.jsonl')).write_text(json.dumps(row) + '\n')
        self.template = self.root / 'template'
        self.template.write_text('{{ .Prompt }}')

    def run_script(self, name, *args):
        return subprocess.run([sys.executable, '-I', str(ROOT / name), *map(str, args)], capture_output=True, text=True)

    def test_training_plan(self):
        out = self.root / 'run'
        result = self.run_script('stage06_finetune.py', '--base', self.base, '--data', self.data, '--out', out, '--iters', 1, '--dry-run')
        self.assertEqual(result.returncode, 0, result.stderr)
        p = json.loads(result.stdout)
        self.assertEqual(p['iterations'], 1)
        self.assertIn('--mask-prompt', p['command'])
        self.assertNotIn('--epochs', p['command'])
        self.assertFalse(out.exists())
        self.assertNotIn('test', p['counts'])

    def test_prepared_chat_preserves_inputs(self):
        module = runpy.run_path(str(ROOT / 'stage06_finetune.py'))
        out = self.root / 'run'
        args = module['parser']().parse_args(['--base', str(self.base), '--data', str(self.data), '--out', str(out), '--iters', '1'])
        before = (self.data / 'train.jsonl').read_text()
        with patch.dict(module['execute'].__globals__, {'validate_targets': lambda *args: None}), patch.object(module['execute'].__globals__['subprocess'], 'run'):
            module['execute'](module['plan'](args))
        row = json.loads((out / 'data/train.jsonl').read_text())
        self.assertEqual(row['messages'][0]['content'], 'hello /no_think')
        self.assertEqual((self.data / 'train.jsonl').read_text(), before)
        self.assertFalse((out / 'data/test.jsonl').exists())
        self.assertTrue(json.loads((out / 'model/tokenizer_config.json').read_text())['chat_template'].startswith('{% set enable_thinking = false %}'))

    def test_export_plan(self):
        result = self.run_script('stage07_export.py', '--base', self.base, '--adapter', self.adapter, '--out', self.root / 'export', '--template', self.template, '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full', '--dry-run')
        self.assertEqual(result.returncode, 0, result.stderr)
        p = json.loads(result.stdout)
        self.assertEqual(p['commands'][1][-2:], ['--quantize', 'q4_K_M'])
        self.assertIn('PARAMETER stop "<|im_end|>"', p['modelfile'])
        self.assertIn('PARAMETER repeat_penalty 1\n', p['modelfile'])
        for model in p['modelfiles'].values():
            self.assertIn('PARAMETER repeat_penalty 1\n', model)
        self.assertNotIn('--quantize', p['commands'][2])

    def test_rejects_overwrite_and_invalid_values(self):
        for extra in (('--out', self.base), ('--out', self.root / 'run', '--iters', 0)):
            result = self.run_script('stage06_finetune.py', '--base', self.base, '--data', self.data, *extra, '--dry-run')
            self.assertNotEqual(result.returncode, 0)

    def test_batches_and_limits(self):
        row = json.loads((self.data / 'train.jsonl').read_text())
        (self.data / 'train.jsonl').write_text((json.dumps(row) + '\n') * 5)
        (self.data / 'valid.jsonl').write_text((json.dumps(row) + '\n') * 2)
        args = ('--base', self.base, '--data', self.data, '--out', self.root / 'run', '--dry-run')
        result = self.run_script('stage06_finetune.py', *args, '--batch-size', 2, '--epochs', 3)
        self.assertEqual(json.loads(result.stdout)['iterations'], 6)
        for extra in (('--batch-size', 3), ('--max-seq-length', 1)):
            self.assertNotEqual(self.run_script('stage06_finetune.py', *args, *extra).returncode, 0)

    def test_system_newline(self):
        module = runpy.run_path(str(ROOT / 'stage06_finetune.py'))
        row = {'messages': [{'role': 'system', 'content': 'rules'}, {'role': 'user', 'content': 'hi'}, {'role': 'assistant', 'content': 'ok'}]}
        for split in ('train', 'valid'):
            (self.data / (split + '.jsonl')).write_text(json.dumps(row) + '\n')
        out = self.root / 'system-run'
        args = module['parser']().parse_args(['--base', str(self.base), '--data', str(self.data), '--out', str(out)])
        with patch.dict(module['execute'].__globals__, {'validate_targets': lambda *args: None}), patch.object(module['execute'].__globals__['subprocess'], 'run'):
            module['execute'](module['plan'](args))
        prepared = json.loads((out / 'data/train.jsonl').read_text())
        self.assertEqual(prepared['messages'][0]['content'], '\nrules')
        self.assertEqual(json.loads((self.data / 'train.jsonl').read_text()), row)
        self.assertIn('prefix first system', json.loads((out / 'metadata.json').read_text())['representation'])

    def test_export_tag_checks_and_unicode_path(self):
        args = ('--base', self.base, '--adapter', self.adapter, '--out', self.root / '棋 run', '--template', self.template, '--dry-run')
        result = self.run_script('stage07_export.py', *args, '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full')
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(json.loads(result.stdout)['modelfile'].startswith('FROM ./fused\n'))
        for tags in (('qwen3:pilot-q4', 'qwen3:pilot-q4'), ('pip', 'pip:latest'), ('Qwen3:pilot-q4', 'qwen3:pilot-full')):
            self.assertNotEqual(self.run_script('stage07_export.py', *args, '--q4-tag', tags[0], '--full-tag', tags[1]).returncode, 0)

    def test_collision_preflight(self):
        module = runpy.run_path(str(ROOT / 'stage07_export.py'))
        from io import BytesIO
        from unittest.mock import Mock
        response = BytesIO(b'{"models":[{"name":"qwen3:pilot-full"}]}')
        response.status = 200
        connection = Mock()
        connection.getresponse.return_value = response
        with patch.object(module['check_tags'].__globals__['http'].client, 'HTTPConnection', return_value=connection):
            with self.assertRaises(ValueError):
                module['check_tags'](['qwen3:pilot-q4', 'qwen3:pilot-full'])
        connection.request.assert_called_once_with('GET', '/api/tags')

    def test_export_entry_preflights_and_pins_host(self):
        from unittest.mock import Mock
        module = runpy.run_path(str(ROOT / 'stage07_export.py'))
        g = module['main'].__globals__
        args = ['stage07', '--base', str(self.base), '--adapter', str(self.adapter), '--out', str(self.root / 'actual'), '--template', str(self.template), '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full']
        run = Mock()
        with patch.object(sys, 'argv', args), patch.dict(g, {'check_tags': Mock(side_effect=ValueError('collision'))}), patch.object(g['subprocess'], 'run', run):
            with self.assertRaises(SystemExit):
                module['main']()
        self.assertFalse((self.root / 'actual').exists())
        run.assert_not_called()
        check = Mock()
        with patch.object(sys, 'argv', args), patch.dict(g, {'check_tags': check}), patch.object(g['subprocess'], 'run', run), patch.dict(g, {'lock_path': lambda: self.root / 'export.lock'}), patch.dict(g['os'].environ, {'OLLAMA_HOST': 'remote.example'}):
            module['main']()
        self.assertEqual(check.call_count, 2)
        check.assert_called_with(['qwen3:pilot-q4', 'qwen3:pilot-full'])
        self.assertEqual(run.call_count, 3)
        for call in run.call_args_list:
            self.assertEqual(call.kwargs['env']['OLLAMA_HOST'], '127.0.0.1:11434')

    def test_compact_plan_and_template(self):
        module = runpy.run_path(str(ROOT / 'stage06_finetune.py'))
        original = self.root / 'original'
        original.mkdir()
        for name in ('tokenizer.json', 'vocab.json', 'merges.txt'):
            (self.base / name).write_text(name)
            (original / name).write_text(name)
        (original / 'tokenizer_config.json').write_text(json.dumps({'chat_template': 'original template'}))
        (self.base / 'config.json').write_text(json.dumps({'quantization': {'group_size': 128, 'bits': 4}}))
        (self.base / 'model.safetensors.index.json').write_text(json.dumps({'metadata': {'total_size': 914237440}}))
        with (self.base / 'model.safetensors').open('wb') as f:
            f.truncate(914316100)
        args = ['--base', str(self.base), '--data', str(self.data), '--out', str(self.root / 'compact')]
        with self.assertRaises(ValueError):
            module['plan'](module['parser']().parse_args(args))
        parsed = module['parser']().parse_args(args + ['--tokenizer-from', str(original)])
        plan = module['plan'](parsed)
        self.assertEqual(plan['base_kind'], 'compact-4bit')
        with patch.dict(module['execute'].__globals__, {'validate_targets': lambda *args: None}), patch.object(module['execute'].__globals__['subprocess'], 'run'):
            module['execute'](plan)
        self.assertIn('original template', (self.root / 'compact/model/tokenizer_config.json').read_text())
        self.assertEqual(json.loads((original / 'tokenizer_config.json').read_text())['chat_template'], 'original template')
        (original / 'merges.txt').write_text('different')
        parsed.out = str(self.root / 'other-compact')
        with self.assertRaisesRegex(ValueError, 'tokenizer mismatch'):
            module['plan'](parsed)
        (original / 'merges.txt').write_text('merges.txt')
        with (self.base / 'model.safetensors').open('wb') as f:
            f.truncate(1)
        with self.assertRaisesRegex(ValueError, 'weights size'):
            module['plan'](parsed)
        export = self.run_script('stage07_export.py', '--base', self.base, '--adapter', self.adapter, '--out', self.root / 'export', '--template', self.template, '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full', '--dry-run')
        self.assertIn('--dequantize', json.loads(export.stdout)['commands'][0])

    def test_collision_after_fusion(self):
        from unittest.mock import Mock
        module = runpy.run_path(str(ROOT / 'stage07_export.py'))
        g = module['main'].__globals__
        args = ['stage07', '--base', str(self.base), '--adapter', str(self.adapter), '--out', str(self.root / 'different-output'), '--template', str(self.template), '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full']
        run = Mock()
        with patch.object(sys, 'argv', args), patch.dict(g, {'check_tags': Mock(side_effect=[None, ValueError('collision')])}), patch.object(g['subprocess'], 'run', run), patch.dict(g, {'lock_path': lambda: self.root / 'export.lock'}):
            with self.assertRaisesRegex(ValueError, 'collision'):
                module['main']()
        self.assertEqual(run.call_count, 1)

    def test_interleaved_exports_with_different_outputs(self):
        module = runpy.run_path(str(ROOT / 'stage07_export.py'))
        g = module['main'].__globals__
        tags = set()
        creates = []
        def check(requested):
            if tags.intersection(requested):
                raise ValueError('collision')
        def run(command, **kwargs):
            if command[1:3] == ['-m', 'mlx_lm.fuse'] and not creates:
                creates.append('fusion paused')
                with patch.object(sys, 'argv', args(self.root / 'second')):
                    module['main']()
            elif command[:2] == ['ollama', 'create']:
                tags.add(command[2])
                creates.append(command[2])
        def args(out):
            return ['stage07', '--base', str(self.base), '--adapter', str(self.adapter), '--out', str(out), '--template', str(self.template), '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full']
        with patch.object(sys, 'argv', args(self.root / 'first')), patch.dict(g, {'check_tags': check}), patch.object(g['subprocess'], 'run', side_effect=run), patch.dict(g, {'lock_path': lambda: self.root / 'export.lock'}):
            with self.assertRaisesRegex(ValueError, 'collision'):
                module['main']()
        self.assertEqual(creates, ['fusion paused', 'qwen3:pilot-q4', 'qwen3:pilot-full'])

    def test_toolchain_plan_and_validation(self):
        converter = self.root / 'converter.py'
        converter.write_text('# converter')
        manifest = self.root / 'toolchain.json'
        venv_bin = self.root / 'venv' / 'bin'
        venv_bin.mkdir(parents=True)
        venv_python = venv_bin / 'python'
        venv_python.symlink_to(Path(sys.executable).resolve())
        data = {'python': str(venv_python), 'converter': str(converter), 'quantize': sys.executable}
        manifest.write_text(json.dumps(data))
        args = ('--base', self.base, '--adapter', self.adapter, '--out', self.root / 'gguf-export', '--template', self.template, '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full', '--toolchain', manifest, '--dry-run')
        result = self.run_script('stage07_export.py', *args)
        self.assertEqual(result.returncode, 0, result.stderr)
        plan = json.loads(result.stdout)
        self.assertEqual(len(plan['commands']), 5)
        self.assertEqual(plan['commands'][1][0], str(venv_python))
        self.assertEqual(plan['toolchain']['python'], str(venv_python))
        self.assertEqual(plan['commands'][1][1], str(converter.resolve()))
        self.assertEqual(plan['commands'][2][-1], 'Q4_K_M')
        self.assertTrue(all('--quantize' not in c for c in plan['commands'][-2:]))
        q4, full = plan['modelfiles'].values()
        for model in (q4, full):
            self.assertIn('PARAMETER repeat_penalty 1\n', model)
        self.assertEqual(q4.split('\n', 1)[1], full.split('\n', 1)[1])
        self.assertEqual(len(plan['toolchain']['manifest_sha256']), 64)
        for key in data:
            invalid = dict(data, **{key: str(self.root / 'missing')})
            manifest.write_text(json.dumps(invalid))
            self.assertNotEqual(self.run_script('stage07_export.py', *args).returncode, 0)
        manifest.write_text(json.dumps(dict(data, quantize=str(converter))))
        self.assertNotEqual(self.run_script('stage07_export.py', *args).returncode, 0)

    def test_lock_path_ignores_environment(self):
        module = runpy.run_path(str(ROOT / 'stage07_export.py'))
        expected = module['lock_path']()
        with patch.dict('os.environ', {'HOME': str(self.root), 'TMPDIR': str(self.root)}):
            self.assertEqual(module['lock_path'](), expected)

    def test_toolchain_collision_after_conversion(self):
        from unittest.mock import Mock
        module = runpy.run_path(str(ROOT / 'stage07_export.py'))
        g = module['main'].__globals__
        converter = self.root / 'converter'
        converter.write_text('converter')
        manifest = self.root / 'toolchain.json'
        manifest.write_text(json.dumps({'python': sys.executable, 'converter': str(converter), 'quantize': sys.executable}))
        args = ['stage07', '--base', str(self.base), '--adapter', str(self.adapter), '--out', str(self.root / 'out'), '--template', str(self.template), '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full', '--toolchain', str(manifest)]
        run = Mock()
        with patch.object(sys, 'argv', args), patch.dict(g, {'check_tags': Mock(side_effect=[None, ValueError('collision')]), 'lock_path': lambda: self.root / 'lock'}), patch.object(g['subprocess'], 'run', run):
            with self.assertRaisesRegex(ValueError, 'collision'):
                module['main']()
        self.assertEqual(run.call_count, 3)

    def test_toolchain_interleaving_at_converter(self):
        module = runpy.run_path(str(ROOT / 'stage07_export.py'))
        g = module['main'].__globals__
        converter = self.root / 'converter'
        converter.write_text('converter')
        manifest = self.root / 'toolchain.json'
        manifest.write_text(json.dumps({'python': sys.executable, 'converter': str(converter), 'quantize': sys.executable}))
        events, tags = [], set()
        def args(out):
            return ['stage07', '--base', str(self.base), '--adapter', str(self.adapter), '--out', str(out), '--template', str(self.template), '--q4-tag', 'qwen3:pilot-q4', '--full-tag', 'qwen3:pilot-full', '--toolchain', str(manifest)]
        def check(requested):
            events.append('check')
            if tags.intersection(requested):
                raise ValueError('collision')
        def run(command, **kwargs):
            if len(command) > 1 and command[1] == str(converter) and 'paused' not in events:
                events.append('paused')
                with patch.object(sys, 'argv', args(self.root / 'second-gguf')):
                    module['main']()
            if command[:2] == ['ollama', 'create']:
                tags.add(command[2])
                events.append(command[2])
        with patch.object(sys, 'argv', args(self.root / 'first-gguf')), patch.dict(g, {'check_tags': check, 'lock_path': lambda: self.root / 'lock'}), patch.object(g['subprocess'], 'run', side_effect=run):
            with self.assertRaisesRegex(ValueError, 'collision'):
                module['main']()
        self.assertEqual(events, ['check', 'paused', 'check', 'check', 'qwen3:pilot-q4', 'qwen3:pilot-full', 'check'])

    def test_target_validation(self):
        import types
        module = runpy.run_path(str(ROOT / 'stage06_finetune.py'))
        out = self.root / 'validation'
        (out / 'data').mkdir(parents=True)
        for split in ('train', 'valid'):
            (out / 'data' / (split + '.jsonl')).write_text('{}\n')
        class Dataset:
            def __init__(self, rows, tokenizer, mask_prompt):
                self.mask_prompt = mask_prompt
            def process(self, row):
                return [1, 2, 3], 2
        transformers = types.ModuleType('transformers')
        transformers.AutoTokenizer = types.SimpleNamespace(from_pretrained=lambda *a, **k: None)
        dataset_module = types.ModuleType('mlx_lm.tuner.datasets')
        dataset_module.ChatDataset = Dataset
        modules = {'transformers': transformers, 'mlx_lm': types.ModuleType('mlx_lm'), 'mlx_lm.tuner': types.ModuleType('mlx_lm.tuner'), 'mlx_lm.tuner.datasets': dataset_module}
        with patch.dict(sys.modules, modules):
            module['validate_targets'](out, 3)
            with self.assertRaisesRegex(ValueError, 'no supervised tokens'):
                module['validate_targets'](out, 2)

if __name__ == '__main__':
    unittest.main()
