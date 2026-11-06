"""Local demo storage only; production must adapt to backend PostgreSQL tables."""
import json
import sqlite3
from contextlib import contextmanager

class SQLiteStore:
    def __init__(self, path):
        self.path = str(path)
        with sqlite3.connect(self.path) as db:
            db.execute('CREATE TABLE IF NOT EXISTS voice_demo_state (id INTEGER PRIMARY KEY, data TEXT NOT NULL)')
            db.execute('INSERT OR IGNORE INTO voice_demo_state VALUES (1, ?)',
                       (json.dumps({'products': {}, 'commands': {}, 'events': []}),))

    @contextmanager
    def transaction(self):
        db = sqlite3.connect(self.path, timeout=15)
        try:
            db.execute('BEGIN IMMEDIATE')
            state = json.loads(db.execute('SELECT data FROM voice_demo_state WHERE id=1').fetchone()[0])
            for product in state['products'].values():
                if 'is_sold_out' not in product:
                    product['is_sold_out'] = product.get('status') == 'SOLD_OUT'
                product.pop('status', None)
            for command in state['commands'].values():
                parsed = command.get('parsed', {})
                if 'discount_price' in parsed:
                    if 'sale_price' not in parsed:
                        parsed['sale_price'] = parsed['discount_price']
                    del parsed['discount_price']
            yield state
            db.execute('UPDATE voice_demo_state SET data=? WHERE id=1', (json.dumps(state),))
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()
