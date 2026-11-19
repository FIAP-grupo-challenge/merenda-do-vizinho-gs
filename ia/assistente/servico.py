"""Assistente do agricultor: o Claude conversa sobre a chamada; sem chave ou quando a IA falha, responde o roteiro."""
import json
import logging
from pathlib import Path

import anthropic

from ia.assistente.roteiro import checklist, itens_compativeis, responder_por_roteiro, semanas_de_entrega
from ia.cliente_claude import ErroIA
from ia.config import MODELO_PADRAO

log = logging.getLogger(__name__)

PROMPT = (Path(__file__).resolve().parents[1] / 'prompts' / 'assistente.md').read_text(encoding='utf-8')
AVISO = 'Vale o texto da chamada. Confirme com a prefeitura ou com a assistência técnica (Emater).'
AVISO_SEM_IA = 'O assistente com IA não respondeu agora; esta é a orientação básica.'
PAPEL_NA_API = {'agricultor': 'user', 'assistente': 'assistant'}

ESQUEMA_RESPOSTA = {
    'type': 'object',
    'properties': {
        'resposta': {'type': 'string'},
        'sugestao': {
            'type': 'object',
            'properties': {'itens': {'type': 'array', 'items': {
                'type': 'object',
                'properties': {'produto_id': {'type': 'string'}, 'quantidade': {'type': 'number'}},
                'required': ['produto_id', 'quantidade'],
                'additionalProperties': False,
            }}},
            'required': ['itens'],
            'additionalProperties': False,
        },
    },
    'required': ['resposta', 'sugestao'],
    'additionalProperties': False,
}


def responder_assistente(chamada: dict, perfil: dict, mensagens: list[dict], cliente=None,
                         modelo: str = MODELO_PADRAO, timeout_s: float = 60) -> dict:
    """{ origem, resposta, sugestao: { itens: [{ produto_id, quantidade }] }, checklist }. Com cliente, quem responde
    é o Claude; sem cliente, o roteiro; se a IA falha (erro da API, tempo esgotado, recusa, resposta fora do
    esquema), o roteiro com AVISO_SEM_IA no começo. Os dados pessoais já foram barrados no servidor."""
    if cliente is not None:
        try:
            dados = _perguntar_ao_claude(chamada, perfil, mensagens, cliente, modelo, timeout_s)
        # LookupError em diante: JSON fora do esquema e o que o SDK deixa escapar de um corpo que não é mensagem
        except (ErroIA, anthropic.AnthropicError, TimeoutError, LookupError, TypeError, ValueError,
                AttributeError) as erro:
            log.warning('IA indisponível no assistente; causa: %r', erro)  # só o erro: nunca a conversa nem a chave
            roteiro = responder_por_roteiro(chamada, perfil, mensagens)
            return _conferir({**roteiro, 'resposta': f"{AVISO_SEM_IA}\n\n{roteiro['resposta']}"}, chamada, perfil)
        return _conferir({'origem': 'ia', **dados, 'checklist': checklist(chamada)}, chamada, perfil)
    return _conferir(responder_por_roteiro(chamada, perfil, mensagens), chamada, perfil)


def _perguntar_ao_claude(chamada, perfil, mensagens, cliente, modelo, timeout_s) -> dict:
    # sem novas tentativas do SDK: duas a mais de timeout_s passariam dos 120 s que o app espera pela IA
    resposta = cliente.with_options(timeout=timeout_s, max_retries=0).messages.create(
        model=modelo,
        max_tokens=16000,
        system=PROMPT,
        output_config={'effort': 'low', 'format': {'type': 'json_schema', 'schema': ESQUEMA_RESPOSTA}},
        # a conversa termina numa mensagem do agricultor (o servidor confere): o Haiku 5.5 não aceita prefill
        messages=[{'role': 'user', 'content': _dados_da_conversa(chamada, perfil)}]
        + [{'role': PAPEL_NA_API[mensagem['papel']], 'content': mensagem['texto']} for mensagem in mensagens],
    )
    if resposta.stop_reason != 'end_turn':  # recusa ('refusal') ou resposta cortada ('max_tokens')
        raise ErroIA(f'stop_reason {resposta.stop_reason}')
    # o texto vem depois do bloco de pensamento: lê pelo tipo do bloco, não pela posição
    dados = json.loads(''.join(bloco.text for bloco in resposta.content if bloco.type == 'text'))
    itens = dados['sugestao']['itens']
    if not (isinstance(dados['resposta'], str) and dados['resposta'].strip() and isinstance(itens, list) and all(
            isinstance(item['produto_id'], str) and type(item['quantidade']) in (int, float) for item in itens)):
        raise ErroIA('resposta fora do esquema')
    return {'resposta': dados['resposta'], 'sugestao': {'itens': itens}}


def _dados_da_conversa(chamada, perfil) -> str:
    # do perfil, só os campos do formato do assistente: o que vier a mais nunca chega à IA
    produtos = [{chave: produto.get(chave) for chave in ('produto_id', 'quantidade_semana', 'meses_safra')}
                for produto in perfil['produtos']]
    perfil_minimo = {chave: perfil.get(chave) for chave in ('municipio', 'uf', 'organico', 'prioridade_rits')}
    dados = {'chamada': chamada, 'perfil': {**perfil_minimo, 'produtos': produtos},
             'semanas_de_entrega': semanas_de_entrega(chamada), 'documentos': checklist(chamada)}
    return 'Dados da conversa (JSON):\n' + json.dumps(dados, ensure_ascii=False)


def _conferir(resposta: dict, chamada: dict, perfil: dict) -> dict:
    """O que vale para a IA e para o roteiro: a sugestão só leva item da chamada que o agricultor produz, sem passar
    do pedido; a resposta termina com o AVISO, uma vez só."""
    pedido = {}
    for item in itens_compativeis(chamada, perfil):  # o mesmo produto em dois itens soma os dois, como na T7
        pedido[item['produto_id']] = pedido.get(item['produto_id'], 0) + item['quantidade']
    sugeridos = {item['produto_id']: min(item['quantidade'], pedido[item['produto_id']])
                 for item in resposta['sugestao']['itens'] if item['produto_id'] in pedido}
    texto = resposta['resposta'].rstrip().removesuffix(AVISO).rstrip()
    return {**resposta, 'resposta': f'{texto}\n\n{AVISO}',
            'sugestao': {'itens': [{'produto_id': produto_id, 'quantidade': quantidade}
                                   for produto_id, quantidade in sugeridos.items() if quantidade > 0]}}
