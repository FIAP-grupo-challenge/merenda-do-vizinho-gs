// Câmara fria da cooperativa (Arduino Uno no TinkerCad).
// A cada 2 s envia uma linha JSON pela Serial, a 9600 baud. Fiação: ligacoes.md.

const int PINO_TEMPERATURA = A0;  // TMP36
const int PINO_PESO = A1;         // potenciômetro, no lugar do sensor de força
const int PINO_PORTA = 2;         // chave da porta com INPUT_PULLUP: HIGH = porta aberta
const int PINO_LED = 13;
const int PINO_BUZZER = 8;

const unsigned long INTERVALO_ENVIO_MS = 2000;
const unsigned long LIMITE_PORTA_ABERTA_MS = 120000;
const float LIMITE_TEMPERATURA_C = 10.0;

unsigned long ultimoEnvio = 0;
unsigned long inicioPortaAberta = 0;

void setup() {
  Serial.begin(9600);
  pinMode(PINO_PORTA, INPUT_PULLUP);
  pinMode(PINO_LED, OUTPUT);
  pinMode(PINO_BUZZER, OUTPUT);
}

void loop() {
  float temperatura = ((analogRead(PINO_TEMPERATURA) * 5.0 / 1023.0) - 0.5) * 100.0;
  float peso = analogRead(PINO_PESO) / 1023.0 * 500.0;
  bool portaAberta = digitalRead(PINO_PORTA) == HIGH;
  unsigned long agora = millis();

  // Porta fechada: o instante fica registrado; ao abrir, a contagem parte dele.
  if (!portaAberta) {
    inicioPortaAberta = agora;
  }
  bool portaAbertaDemais = portaAberta && (agora - inicioPortaAberta > LIMITE_PORTA_ABERTA_MS);

  // Álgebra de Boole (F3C08): alarme = (temperatura > 10,0) OU (porta aberta por mais de 120 000 ms)
  bool alarme = (temperatura > LIMITE_TEMPERATURA_C) || portaAbertaDemais;

  digitalWrite(PINO_LED, alarme ? HIGH : LOW);
  if (alarme) {
    tone(PINO_BUZZER, 1000);
  } else {
    noTone(PINO_BUZZER);
  }

  if (agora - ultimoEnvio >= INTERVALO_ENVIO_MS) {
    ultimoEnvio = agora;
    Serial.print("{\"dispositivo\":\"camara-01\",\"temperatura_c\":");
    Serial.print(temperatura, 1);
    Serial.print(",\"peso_kg\":");
    Serial.print(peso, 1);
    Serial.print(",\"porta_aberta\":");
    Serial.print(portaAberta ? "true" : "false");
    Serial.println("}");
  }
}
