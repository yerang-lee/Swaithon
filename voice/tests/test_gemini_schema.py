import json
from unittest.mock import Mock
import pytest
from google import genai
from google.genai import models, types
from jangboso_voice.parser import GeminiParser, gemini_schema
from jangboso_voice.schema import Command

def test_real_sdk_request_conversion_without_network():
    client = genai.Client(api_key='unit-test-not-a-real-key')
    try:
        config = types.GenerateContentConfig(response_mime_type='application/json',
                                            response_json_schema=gemini_schema())
        params = types._GenerateContentParameters(model='gemini-3.5-flash-lite', contents='test', config=config)
        request = models._GenerateContentParameters_to_mldev(client._api_client, params)
        assert 'exclusiveMinimum' not in json.dumps(request)
        assert 'exclusiveMaximum' not in json.dumps(request)
        assert 'responseJsonSchema' in request['generationConfig']
    finally:
        client.close()

def test_parser_uses_provider_schema_and_validates_response():
    parser = GeminiParser.__new__(GeminiParser)
    parser.model = 'test'
    parser.client = Mock()
    parser.client.models.generate_content.return_value.text = json.dumps({'intent':'PRODUCT_CREATE','price':5000})
    assert parser.parse(['사과 10개 5천 원']).price == 5000
    config = parser.client.models.generate_content.call_args.kwargs['config']
    assert config.response_schema is None
    assert config.response_json_schema == gemini_schema()
    parser.client.models.generate_content.return_value.text = '{"intent":"PRODUCT_CREATE","price":0}'
    with pytest.raises(ValueError):
        parser.parse(['test'])

@pytest.mark.parametrize('field,value',[('price',0),('sale_quantity',0),('discount_rate',100),('discount_rate',0),('discount_price',0)])
def test_strict_local_bounds_preserved(field,value):
    with pytest.raises(ValueError):
        Command(intent='PRODUCT_CREATE',**{field:value})
