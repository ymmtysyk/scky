(function (ext) {
    var socket = null;
    var evt_statuses = {};
    var evt_vals = {}; // stores last value sent by an event
    var var_struct = {};
    var speech_struct = {};

    // myStatus, myMsg are used to change the color of the extension "light"
    // 0 => not connected (Red)
    // 1 => partially connected (Yellow)
    // 2 => connected (Green)
    var myStatus = 0;
    var myMsg = "disconnected";
    
    // maps animation names to the appropriate animation path
    var animations = {
        "wave" : "animations/Stand/Gestures/Hey_1",
        "bow" : "animations/Stand/Gestures/BowShort_1",
        "nod" : "animations/Stand/Gestures/Yes_1",
        "shake head" : "animations/Stand/Gestures/No_1",
        "ウェーブ" : "animations/Stand/Gestures/Hey_1",
        "おじぎ" : "animations/Stand/Gestures/BowShort_1",
        "うなずく" : "animations/Stand/Gestures/Yes_1",
        "頭をふる" : "animations/Stand/Gestures/No_1"
    };

    var behavior_animations = { 
        "基本姿勢": "taro_motion/n-kihonshisei",
        "両手ひろげ": "taro_motion/n-ryotehiroge",
        "片手でどうぞ": "taro_motion/n-katatededouzo",
        "ジャン": "taro_motion/n-futuujan",
        "両手腰で傾く": "taro_motion/n-ryotekoshidekatamuku",
        "バンザイ": "taro_motion/n-banzai",
        "両手前に": "taro_motion/n-he",
        "やれやれ": "taro_motion/n-yareyare",
        "片手でガッツポーズ": "taro_motion/n-katatedegattsupozu",
        "両手を腰に": "taro_motion/n-ryotewokoshini",
        "がっかり": "taro_motion/n-kowareru",
        "エクセレント！": "taro_motion/n-excellent",
        "片手＋うなずく": "taro_motion/n-katateage+unazuki",
        "両手＋うなずく": "taro_motion/n-nandesu",
        "コレです": "taro_motion/n-koredesu",
        "オッス！": "taro_motion/n-ossu!",
        "両手でほめる": "taro_motion/n-perfect",
        "次はあなたです": "taro_motion/n-qu",
        "両手広げ": "taro_motion/n-ryotehiroge",
        "バイバイ": "taro_motion/n-goodbye",
        "以上です": "taro_motion/n-ijou",
        "いやいやいや": "taro_motion/n-iyaiya",
        "おじぎ": "taro_motion/n-ojigi",
        "タブレットに注目": "taro_motion/n-tabletnichumoku2",
        "歩く": "taro_motion/n-walk",
        "なーんてね": "taro_motion/n-ochamesan",
        "拝む": "taro_motion/n-ogamu",
        "泳ぐ": "taro_motion/n-oyogu",
        "不思議ポーズ１": "taro_motion/n-uranai1",
        "不思議ポーズ３": "taro_motion/n-uranai3",
        "不思議ポーズ２": "taro_motion/n-uranai2" 
    };

    var ja_menu_mapping = {
        "Pepperと接続できた" : "InitializationComplete", 
        "右のバンパーがおされた": "RightBumperPressed", 
        "左のバンパーがおされた": "LeftBumperPressed", 
        "左手にふれた": "HandLeftBackTouched", 
        "右手にふれた": "HandRightBackTouched", 
        "頭にふれた": "HeadTouched",
        "顔を見つけた": "FaceDetected", 
        "聞き取った": "SpeechDetected", 
        "言葉がわかった": "WordRecognized", 
        "ボタン１がおされた": "Button1Pressed", 
        "ボタン２がおされた": "Button2Pressed", 
        "ボタン３がおされた": "Button3Pressed", 
        "ボタン４がおされた": "Button4Pressed", 
        "ボタンYESがおされた": "ButtonYesPressed", 
        "ボタンNOがおされた": "ButtonNoPressed"
    }

    var ja_tablet_mapping = {
        "Pepperロゴ" : "pepper", 
        "お題画像" : "odai"
    }
    
    /**
    * Send commands to server, to be passed on to the naoqi python sdk
    * @param {String} cmd the module and command to execute (eg. "ALTextToSpeech.say")
    * @param {Array} args list of arguments to send along with the command
    */
    var send_cmd_naoqi = function(cmd, args) {
        var msg = JSON.stringify({ "pepper_cmd_naoqi" : cmd, "args" : args});
        window.socket.send(msg)
    }

    /**
    * Sets up the connection to the server
    */
    ext.cnct = function () {
        console.log("Connecting to Server...");
        
        window.socket = new WebSocket("ws://127.0.0.1:8080");
        
        window.socket.onopen = function () {
            var msg = JSON.stringify({ "info": "ScratchX ready" });
            window.socket.send(msg);
            console.log("Connected!");
        };

        window.socket.onmessage = function (message) {
            var msg = JSON.parse(message.data);

            if (msg["pepper_evt"]) { // events from pepper (eg. "RightBumperPressed")
                if (msg["pepper_evt"] == "InitializationComplete") {
                    myStatus = 2;
                    myMsg = "connected";
                } 
                evt_vals[msg["pepper_evt"]] = msg["evt_val"];
                evt_statuses[msg["pepper_evt"]] = true;
                if (msg["pepper_evt"].indexOf("TactilTouched") >= 0) {
                    evt_vals["HeadTouched"] = msg["evt_val"];
                    evt_statuses["HeadTouched"] = true;
                }
            } else if (msg["pepper_var_response"]) { // data from pepper (eg. LElbow joint angle)
                var_struct[msg["pepper_var_response"]](msg["pepper_var_val"][0]);
                var_struct[msg["pepper_var_response"]] = undefined;
            } else if (msg["connected"]) { // response from server verifying that Scratch is connected
                myStatus = 1;
                myMsg = "initializing";
            } 

            // console.log(msg);
        };
        
        window.socket.onclose = function (event) {
            console.log("Connection closed.");
            socket = null;
            ext._shutdown();
        };
    };

    /**
    * Cleanup function when the extension is unloaded
    */
    ext._shutdown = function () {
        var msg = JSON.stringify({ "info": "shutdown" });
        window.socket.send(msg);

        myStatus = 0;
        myMsg = "disconnected";
    };

    /**
    * Status reporting code. 
    * Use this to report missing hardware, plugin or unsupported browser
    * (occassionally polled to update the color of the button)
    */ 
    ext._getStatus = function (status, msg) {
        return {status: myStatus, msg: myMsg};
    };

    /**
    * Command to have pepper say the given string (no extra animation)
    * @param {String} say_str the string for Pepper to say
    */ 
    ext.say = function(say_str, pitch, speed) {
        pitch = Math.min(Math.max(50, pitch), 200);
        speed = Math.min(Math.max(50, speed), 400);
        var msg = JSON.stringify({ "pepper_say": say_str, "pitch" : pitch, "speed" : speed, "cmd" : "ALTextToSpeech.say" });
        window.socket.send(msg);
    }

    /**
    * @param {String} animation (must be a key in 'animations') the default animation for Pepper to perform
    */
    ext.animate = function(animation) {
        send_cmd_naoqi("ALAnimationPlayer.run", [animations[animation]]);
    }

    ext.animate_behavior = function(animation) {
        send_cmd_naoqi("ALBehaviorManager.runBehavior", [behavior_animations[animation]]);
    }

    /**
    * Simultaneously perform an animation and say a string
    * @param {String} say_str the string for Pepper to say
    * @param {String} animation (must be a key in 'animations') the default animation for Pepper to perform
    */
    ext.say_with_animation = function(say_str, animation, pitch, speed) {
        pitch = Math.min(Math.max(50, pitch), 200);
        speed = Math.min(Math.max(50, speed), 400);
        var msg = JSON.stringify({ 
            "pepper_say": "^start(" + animations[animation] + ") " + say_str, 
            "pitch" : pitch, 
            "speed" : speed,
            "cmd" : "ALAnimatedSpeech.say" });
        window.socket.send(msg);
    }

    /**
    * Simultaneously perform an animation and say a string
    * @param {String} say_str the string for Pepper to say
    * @param {String} animation (must be a key in 'animations') the default animation for Pepper to perform
    */
    ext.say_with_animation_ja = function(animation, say_str, pitch, speed) {
        pitch = Math.min(Math.max(50, pitch), 200);
        speed = Math.min(Math.max(50, speed), 400);
        var msg = JSON.stringify({ 
            "pepper_say": "^start(" + animations[animation] + ") " + say_str, 
            "pitch" : pitch, 
            "speed" : speed,
            "cmd" : "ALAnimatedSpeech.say" });
        window.socket.send(msg);
    }

    ext.say_with_animation_behavior = function(animation, say_str, pitch, speed) {
        pitch = Math.min(Math.max(50, pitch), 200);
        speed = Math.min(Math.max(50, speed), 400);
        var msg = JSON.stringify({ 
            "pepper_say_behavior": say_str, 
            "pitch" : pitch, 
            "speed" : speed,
            "animation" : behavior_animations[animation],
            "cmd" : "ALBehaviorManager.startBehavior" });
        window.socket.send(msg);
    }
    /**
    * Uses Pepper's contextual understanding to add gestures
    * @param {String} say_str the string for Pepper to say
    */
    ext.say_with_contextual_gestures = function(say_str, pitch, speed) {
        // send_cmd_naoqi("ALAnimatedSpeech.say", [say_str]);
        pitch = Math.min(Math.max(50, pitch), 200);
        speed = Math.min(Math.max(50, speed), 400);
        var msg = JSON.stringify({ 
            "pepper_say": say_str, 
            "pitch" : pitch, 
            "speed" : speed,
            "cmd" : "ALAnimatedSpeech.say" });
        window.socket.send(msg);
    }

    /**
    * @param {String} language set Pepper's language for use with a particular dialog file
    */
    ext.set_speech_language = function(language) {
        var languages = {"English" : "English", "日本語" : "Japanese", "英語" : "English"};
        send_cmd_naoqi("ALDialog.setLanguage", [languages[language]]);
        send_cmd_naoqi("ALSpeechRecognition.setLanguage", [languages[language]]);
    }

    /**
    * Moves Pepper a certain distance from where he currently stands
    * @param {Number} x amount Pepper should move in meters. Positive implies rightward motion
    * @param {Number} y amount Pepper should move in meters. Positive implies forward motion
    * @param {Number} rad amount Pepper should rotate in radians. Positive implies CCW motion
    */
    ext.move = function(x, y, rad) {
        var final_x = x;
        var final_y = y;
        if (lang == 'ja') { // x and y are flipped
            final_x = y;
            final_y = x;
        }
        send_cmd_naoqi("ALMotion.moveTo", [final_x, final_y, rad]);
    }

    /**
    * Event listener for when a specific Pepper event occurs
    * @param {String} evt ALMemory event that will trigger the appropriate block stack
    */
    ext.when_evt_occurs = function(evt) {
        if (ja_menu_mapping[evt]) {
            evt = ja_menu_mapping[evt];
        }
        if (evt_statuses[evt]) {
            // enable pseudo-asychronous behavior
            setTimeout(function() {evt_statuses[evt] = false;}, 1000);
            return true;
        }
        return false;
    }

    /**
    * Display template tablet pages to trigger tablet-based events
    * @param {String} view_name the name of the scene/page to display on the tablet
    */
    ext.change_tablet_view = function(view_name) {
        if (ja_tablet_mapping[view_name]) {
            view_name = ja_tablet_mapping[view_name];
        }
        send_cmd_naoqi("ALMemory.raiseEvent", ["changeScene", view_name]);
    }

    /**
    * Report the last value passed by an event
    * @param {String} var_name the name of the event to get the value of
    */
    ext.pepper_evt_val = function(var_name) {
        if (ja_menu_mapping[var_name]) {
            var_name = ja_menu_mapping[var_name];
        }
        if (evt_vals[var_name] && evt_vals[var_name].length > 0) {
            return extract_val(evt_vals[var_name]);
        }
        return undefined;
    }

    // helper to extract the first value from a nested list
    var extract_val = function(ls) {
        if (typeof(ls) == typeof([])) {
            return extract_val(ls[0]);
        }
        return ls;
    }

    /**
    * @param {Array} space_separated_wordlist words to set Pepper's vocabulary to, space separated.
    */
    ext.speech_recognition = function(space_separated_wordlist) {
        var word_list = space_separated_wordlist.trim().split(/[ 　]+/);
        var msg = JSON.stringify({ "pepper_speech_detection": word_list });
        window.socket.send(msg);
    }

    /**
    * @param {String} filename name of the file to display on Pepper's tablet. Must include file extension and already be uploaded to Pepper.
    */
    ext.display_media = function(filename) {
        var msg = JSON.stringify({ "pepper_display_media": filename.trim() });
        window.socket.send(msg);
    }

    /**
    * Hides the media on Pepper's tablet display.
    */
    ext.hide_media = function() {
        send_cmd_naoqi("ALTabletService.hideImage", []);
    }
    
    /**
    * @param {String} filename name of the media file to upload to Pepper. Must include file extension.
    */
    ext.upload_media = function(filename) {
        var msg = JSON.stringify({ "pepper_upload_media": filename });
        window.socket.send(msg);
    }

    ext.pause_speech_recognition = function() {
        send_cmd_naoqi("ALSpeechRecognition.pause", [true]);
    }

    ext.resume_speech_recognition = function() {
        send_cmd_naoqi("ALSpeechRecognition.pause", [false]);
    }
    
    var paramString = window.location.search.replace(/^\?|\/$/g, '');
    var vars = paramString.split("&");
    var lang = 'en';
    for (var i=0; i<vars.length; i++) {
        var pair = vars[i].split('=');
        if (pair.length > 1 && pair[0]=='lang')
            lang = pair[1];
    }
    
    var block_descriptors = {
        en: [
                // connection
                [" ", "Connect to server", "cnct"],

                // basic speech/ animation
                [" ", "Say %s pitch: %n \% speed %n \%", "say", "hello", 100, 100],
                [" ", "Say %s with contextual gestures pitch: %n \% speed %n \%", "say_with_contextual_gestures", "hello", 100, 100],
                [" ", "Animate %m.posesMenu", "animate", "wave"],
                [" ", "Say %s with animation %m.posesMenu pitch: %n \% speed %n \%", "say_with_animation", "hello", "wave", 100, 100],
                [" ", "Add %s to vocabulary", "speech_recognition", "hello goodbye"],

                // dialog
                [" ", "Set speech language %m.languageMenu", "set_speech_language", "English"],

                // movement
                [" ", "Move x: %n m, y: %n m, turn: %n rad", "move", 0.0, 0.0, 0.0],

                // tablet-relevant blocks
                [" ", "Change tablet view %m.tabletPageMenu", "change_tablet_view", "4ButtonView"],
                [" ", "Display %s on tablet", "display_media", "dog.jpg"],
                [" ", "Hide tablet image", "hide_media"],
                [" ", "Upload media file %s", "upload_media", "filename.jpg"],

                // event listener
                ["h", "When %m.eventMenu", "when_evt_occurs", "InitializationComplete"],

                // data recorder/ variable
                ["r", "%m.dataMenu value", "pepper_evt_val", "WordRecognized"],
            ],
        ja: [
                // connection
                [" ", "Pepperとつなぐ", "cnct"],

                // basic speech/ animation
                [" ", "%s しゃべる 高さ %n はやさ %n", "say", "こんにちは", 100, 100],
                [" ", "%s 動きながらしゃべる 高さ %n はやさ %n", "say_with_contextual_gestures", "こんにちは", 100, 100],
                // [" ", "%m.posesMenu の動き", "animate", "ウェーブ"],
                [" ", "%m.behaviorMenu の動き", "animate_behavior", "基本姿勢"],
                // [" ", "%m.posesMenu の動きで %s としゃべる 高さ %n はやさ %n", "say_with_animation_ja", "ウェーブ", "こんにちは", 100, 100],
                [" ", "%m.behaviorMenu の動きで %s としゃべる 高さ %n はやさ %n", "say_with_animation_behavior", "基本姿勢", "こんにちは", 100, 100],
                [" ", "%s を聞き取るようにする", "speech_recognition", "こんにちは さようなら"],

                [" ", "聞き取りストップ", "pause_speech_recognition"],
                [" ", "聞き取りスタート", "resume_speech_recognition"],

                // dialog
                [" ", "言語: %m.languageMenu", "set_speech_language", "日本語"],

                // movement
                [" ", "前後 %n, 左右 %n, 角度 %n に移動する", "move", 0.0, 0.0, 0.0],

                // tablet-relevant blocks
                [" ", "ディスプレイ表示 %m.tabletPageMenu", "change_tablet_view", "ボタン４つ"],
                [" ", "ディスプレイに %s を表示", "display_media", "dog.jpg"],
                [" ", "ディスプレイの表示を消す", "hide_media"],
                [" ", "%s をPepperに送る", "upload_media", "filename.jpg"],

                // event listener
                ["h", "%m.eventMenu が起きたとき", "when_evt_occurs", "Pepperと接続できた"],

                // data recorder/ variable
                ["r", "%m.dataMenu の値を取得する", "pepper_evt_val", "言葉がわかった"],
            ]
        }

    var menu_descriptors = {
        en: {
            eventMenu : ["InitializationComplete", "RightBumperPressed", "LeftBumperPressed", "HandLeftBackTouched", "HandRightBackTouched", "HeadTouched", "FaceDetected", "SpeechDetected", "WordRecognized", "Button1Pressed", "Button2Pressed", "Button3Pressed", "Button4Pressed", "ButtonYesPressed", "ButtonNoPressed"],
            dataMenu : ["FaceDetected", "WordRecognized"],
            posesMenu : ["wave", "bow", "nod", "shake head"],
            languageMenu : ["English", "日本語"],
            safetyMenu : ["on", "off"],
            variableMenu : ["HeadPitch", "HeadYaw", "HipPitch", "HipRoll", "KneePitch", "LElbowRoll", "LElbowYaw", "LHand", "LShoulderPitch", "LShoulderRoll", "LWristYaw", "RElbowRoll", "RElbowYaw", "RHand", "RShoulderPitch", "RShoulderRoll", "RWristYaw"],
            stiffnessMenu : ["Head", "LArm", "RArm"],
            tabletPageMenu : ["pepper", "odai"],
        },
        ja: {
            eventMenu : ["Pepperと接続できた", "右のバンパーがおされた", "左のバンパーがおされた", "左手にふれた", "右手にふれた", "頭にふれた", "顔を見つけた", "聞き取った", "言葉がわかった", "ボタン１がおされた", "ボタン２がおされた", "ボタン３がおされた", "ボタン４がおされた", "ボタンYESがおされた", "ボタンNOがおされた"],
            dataMenu : ["言葉がわかった"],
            posesMenu : ["ウェーブ", "おじぎ", "うなずく", "頭をふる"],
            behaviorMenu: ["基本姿勢", "両手ひろげ", "片手でどうぞ", "ジャン", "両手腰で傾く", "バンザイ", "両手前に", "やれやれ", "片手でガッツポーズ", "両手を腰に", "がっかり", "エクセレント！", "片手＋うなずく", "両手＋うなずく", "コレです", "オッス！", "両手でほめる", "次はあなたです", "両手広げ", "バイバイ", "以上です", "いやいやいや", "おじぎ", "タブレットに注目", "歩く", "なーんてね", "拝む", "泳ぐ", "不思議ポーズ１", "不思議ポーズ３", "不思議ポーズ２"],
            languageMenu : ["日本語", "英語"],
            safetyMenu : ["on", "off"],
            variableMenu : ["HeadPitch", "HeadYaw", "HipPitch", "HipRoll", "KneePitch", "LElbowRoll", "LElbowYaw", "LHand", "LShoulderPitch", "LShoulderRoll", "LWristYaw", "RElbowRoll", "RElbowYaw", "RHand", "RShoulderPitch", "RShoulderRoll", "RWristYaw"],
            stiffnessMenu : ["Head", "LArm", "RArm"],
            ta
u : ["Pepperのロゴ画像", "お題"],
        }
    }
    
    // Block and block menu descriptions
    var descriptor = {
        // format: Block type, block name, function name, default variables
        blocks: block_descriptors[lang],
        menus: menu_descriptors[lang],
        
        // documentation link
        url: "https://gist.github.com/loafa/4aa2a2546cfdda3c2320b1bbe2d9e579"
    };

    // Register the extension
    ScratchExtensions.register("PepperX", descriptor, ext);
})({});
