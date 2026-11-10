from fastapi.testclient import TestClient
from backend.voice.jangboso_voice.demo import create_app

def test_swagger_bearer_scheme_and_authentication(tmp_path, monkeypatch):
    monkeypatch.setenv('VOICE_DEMO_TOKEN', 'local-demo-test-token')
    monkeypatch.setenv('VOICE_PARSER', 'fixture')
    monkeypatch.setenv('VOICE_DB', str(tmp_path/'swagger.db'))
    client = TestClient(create_app())
    schema = client.get('/openapi.json').json()
    assert schema['components']['securitySchemes']['DemoBearer']['scheme'] == 'bearer'
    operation = schema['paths']['/voice/analyze']['post']
    assert operation['security'] == [{'DemoBearer': []}]
    assert not any(p['name'].lower() == 'authorization' for p in operation.get('parameters', []))
    for authorization in (None, 'Bearer wrong-token', 'Basic local-demo-test-token'):
        headers = {} if authorization is None else {'Authorization': authorization}
        assert client.get('/products', headers=headers).status_code == 401
    assert client.get('/products', headers={'Authorization':'Bearer local-demo-test-token'}).status_code == 200
