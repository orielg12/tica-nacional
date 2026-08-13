@echo off
set "JAVA_HOME=C:\Program Files\Android\Android Studio\jbr"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo === Verificando Java ===
java -version
if errorlevel 1 (
    echo ERROR: Java no encontrado
    pause
    exit /b 1
)

echo.
echo === Compilando web assets (npm run build) ===
call npm run build
if errorlevel 1 (
    echo ERROR: Fallo npm run build
    pause
    exit /b 1
)

echo.
echo === Sincronizando con Android (cap sync) ===
call npx cap sync android
if errorlevel 1 (
    echo ERROR: Fallo cap sync android
    pause
    exit /b 1
)

echo.
echo === Compilando APK (Gradle assembleDebug) ===
cd android
call gradlew.bat assembleDebug
if errorlevel 1 (
    echo ERROR: Fallo gradlew assembleDebug
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo =============================================
echo  APK generado exitosamente!
echo  Ubicacion: android\app\build\outputs\apk\debug\app-debug.apk
echo =============================================
pause
