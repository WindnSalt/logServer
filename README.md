# logServer

Quick and dirty nodeJS server that can be used for logging via http. I use this mostly for my ESP dev projects. Heres's my logging code for the ESP:

```cpp
#include <WiFi.h>
#include <HTTPClient.h>
#include "freertos/semphr.h"

#define SERVER_URL "http://[YOU_RSERVER_IP]:8080/log/[logchannel]"
#define MAX_LOG_SIZE 255

#define LOG_PRINTLN(msg) logWrapper((String(msg) + "\n").c_str())
#define LOG_PRINTF(...) logWrapper(__VA_ARGS__)

static SemaphoreHandle_t logServerMutex = xSemaphoreCreateMutex();

class ScopedSemaphoreLock
{
public:
    ScopedSemaphoreLock(SemaphoreHandle_t semaphore)
        : _semaphore(semaphore)
    {
        xSemaphoreTake(_semaphore, portMAX_DELAY);
    }

    ~ScopedSemaphoreLock()
    {
        xSemaphoreGive(_semaphore);
    }

private:
    SemaphoreHandle_t _semaphore;
};

void logWrapper(const char *format, ...)
{
    ScopedSemaphoreLock lock(logServerMutex);
    char logWrapper_logMessage[MAX_LOG_SIZE + 1];

    va_list args;
    va_start(args, format);
    if (vsnprintf(logWrapper_logMessage, MAX_LOG_SIZE, format, args) > MAX_LOG_SIZE)
    {
        logWrapper_logMessage[MAX_LOG_SIZE - 1] = '\n';
        logWrapper_logMessage[MAX_LOG_SIZE] = '\0';
    }
    va_end(args);

    if (WiFi.status() != WL_CONNECTED)
    {
        Serial.print(logWrapper_logMessage);
        return;
    }

    HTTPClient http;
    http.begin(SERVER_URL);
    http.addHeader("Content-Type", "text/plain");
    http.POST(logWrapper_logMessage);
    http.end();
}
