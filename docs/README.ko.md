# Pi DIY Provider

[English](../README.md) | [简体中文](README.zh-CN.md) | [繁體中文](README.zh-TW.md) | [日本語](README.ja.md) | 한국어

JSON을 직접 편집하지 않고도 API 키 기반 릴레이 서비스와 사용자 지정 공급자를 Pi에 설정할 수 있는 전용 패키지입니다. 공급자와 모델 정의를 `~/.pi/agent/models.json`에 기록하고, Pi의 모델 레지스트리를 새로 고친 다음 확장 프로그램 런타임을 안전하게 다시 불러옵니다.

## 설치

로컬 체크아웃에서 설치하려면 다음을 실행합니다.

```bash
pi install /absolute/path/to/pi-diy-provider
```

한 세션에서만 시험하려면 다음을 실행합니다.

```bash
pi -e /absolute/path/to/pi-diy-provider
```

## 사용법

`/provider-add`를 실행한 후 다음 항목을 입력합니다.

- 안정적인 소문자 공급자 ID
- 표시 이름
- HTTP(S) Base URL
- API 유형(기본값은 OpenAI Chat Completions이며 OpenAI Responses, Anthropic Messages, Google Generative AI도 지원)
- 로그인 후 모델을 자동 검색할지, 모델 ID를 직접 입력할지 여부

권장하는 자동 검색 절차는 다음과 같습니다.

```text
/provider-add
/login <provider-id>
/provider-model-sync <provider-id>
```

`/provider-model-sync`는 Pi의 자격 증명 저장소에서 API 키를 가져와 공급자의 모델 카탈로그 엔드포인트를 요청합니다. 검색된 모델 ID는 쉼표로 구분된 목록으로 편집기에 표시되므로 저장 전에 검토할 수 있습니다. 목록을 확인하면 `models.json`을 업데이트하고 Pi를 새로 고쳐 인증된 모델을 `/model`에서 사용할 수 있게 합니다.

자동 검색은 OpenAI 및 Anthropic 형식의 `{ "data": [...] }` 카탈로그와 Google 형식의 `{ "models": [...] }` 카탈로그를 인식합니다. 저장된 키는 선택한 API에 맞는 인증 방식으로 전송되며 요청은 20초 후 시간 초과됩니다. 릴레이 서비스는 호환되는 모델 목록 엔드포인트를 제공해야 합니다. 제공하지 않는 경우 `/provider-add`를 다시 실행하고 모델 직접 입력을 선택하세요.

이 확장 프로그램은 `models.json`의 관련 없는 설정을 그대로 유지합니다. 기존 파일을 변경하기 전에 같은 디렉터리에 `models.json.backup-20260905T010203004Z`와 같은 타임스탬프 백업을 만든 다음 원본 파일을 원자적으로 교체합니다. 기존 JSON 주석도 읽을 수 있지만 다시 작성된 파일은 표준 JSON 형식으로 정리됩니다. 백업에는 원본 텍스트가 그대로 보존됩니다.

API 키는 `models.json`에 기록되지 않습니다. 모델을 직접 입력한 경우 다음을 실행하세요.

```text
/login <provider-id>
```

공급자는 Pi의 기본 API 키 공급자 목록에 표시됩니다. 키를 Pi의 자격 증명 저장소에 저장하면 직접 설정한 모델이 `/model`에 나타납니다. 자동 검색 모드의 공급자는 `/provider-model-sync`에서 비어 있지 않은 모델 목록을 저장한 후 표시됩니다. 이 패키지가 `/provider-add`와 `/provider-model-sync`를 별도 명령으로 제공하는 이유는 Pi 확장 API가 임의의 설정 작업을 기본 `/login` 메뉴에 추가하는 공식적인 방법을 제공하지 않기 때문입니다.

## 개발

Node.js 22.19 이상이 필요합니다.

```bash
npm install --ignore-scripts
npm run check
```
