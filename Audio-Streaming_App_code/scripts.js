const userName = "TJ-"+Math.floor(Math.random() * 100000)
const password = "x";
document.querySelector('#user-name').innerHTML = userName;

//if trying it on a phone, use this instead...
//const socket = io.connect('YOUR_IP_ADDRESS',{
const socket = io.connect('https://localhost:8181/',{
    auth: {

        userName,password
    }
})

const localAudioEl = document.querySelector('#local-audio');
const remoteAudioEl = document.querySelector('#remote-audio');
const audioInputSelect = document.querySelector('#audio-input');
const audioOutputSelect = document.querySelector('#audio-output');
const toggleFilterBtn = document.querySelector('#toggle-filter');
const toggleVisualizationBtn = document.querySelector('#toggle-visualization');
const canvas = document.querySelector('#visualizer');
const canvasCtx = canvas.getContext('2d');


let localStream; 
let remoteStream; 
let peerConnection; 
let filter;
let didIOffer = false;
let audioContext, gainNode, biquadFilter;
let isFilterActive = false;
let isWaveform = true;
let analyserNode;



const WIDTH = canvas.width;
const HEIGHT = canvas.height;
let animationFrameId;

let peerConfiguration = {
    iceServers:[
        {
            urls:[
              'stun:stun.l.google.com:19302',
              'stun:stun1.l.google.com:19302'
            ]
        }
    ]
}




const setupAudioFilter = () => {
    if (!audioContext) {
        audioContext = new AudioContext(); 
    }

    if (!gainNode) {
        gainNode = audioContext.createGain();
        gainNode.gain.value = 0.75; // Set the gain
    }

    if (!biquadFilter) {
        biquadFilter = audioContext.createBiquadFilter();
        biquadFilter.type = 'lowshelf';
        biquadFilter.frequency.setValueAtTime(200, audioContext.currentTime); // Set frequency to 200 Hz
    }
};



const applyFilter = (stream) => {
    if (!audioContext || !gainNode || !biquadFilter) {
        setupAudioFilter(); 
    }

    const audioSource = audioContext.createMediaStreamSource(stream);
    
   
    audioSource.connect(gainNode);

    if (isFilterActive) {
        gainNode.connect(biquadFilter).connect(audioContext.destination);
    } 
    else {
        gainNode.connect(audioContext.destination);
    }

   
    setupVisualizer(stream);
};




toggleFilterBtn.addEventListener('click', () => {
    if (!audioContext) setupAudioFilter(); 

    if (!localStream) {
        console.log('No local stream available to apply the filter.');
        return;
    }

    isFilterActive = !isFilterActive;

    if (isFilterActive) {
        if (audioContext.state === 'suspended') {
            audioContext.resume().then(() => {
                applyFilter(localStream);
                document.getElementById('toggle-filter').innerText = 'Disable Audio Filter';
                console.log("Audio filter enabled.");
            }).catch(err => console.error('Error resuming audio context:', err));
        } else {
            applyFilter(localStream);
            document.getElementById('toggle-filter').innerText = 'Disable Audio Filter';
            console.log("Audio filter enabled.");
        }
    } else {
        gainNode.disconnect();
        gainNode.connect(audioContext.destination); 
        document.getElementById('toggle-filter').innerText = 'Enable Audio Filter';
        console.log("Audio filter disabled.");
    }

    
    if (!analyserNode) {
        setupVisualizer(localStream); 
    }
});




const setupVisualizer = (stream) => {
    const audioSource = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;

   
    audioSource.connect(analyserNode);
    
   
    analyserNode.connect(audioContext.destination);

    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);


    const draw = () => {
        animationFrameId = requestAnimationFrame(draw);
        canvasCtx.clearRect(0, 0, WIDTH, HEIGHT);

        if (isWaveform) {
            analyserNode.getByteTimeDomainData(dataArray);
            canvasCtx.lineWidth = 2;
            canvasCtx.strokeStyle = 'rgb(0, 123, 255)';
            canvasCtx.beginPath();
            const sliceWidth = WIDTH / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * HEIGHT / 2;

                if (i === 0) {
                    canvasCtx.moveTo(x, y);
                } else {
                    canvasCtx.lineTo(x, y);
                }

                x += sliceWidth;
            }
            canvasCtx.lineTo(WIDTH, HEIGHT / 2);
            canvasCtx.stroke();
        } else {
            analyserNode.getByteFrequencyData(dataArray);
            const barWidth = (WIDTH / bufferLength) * 2.5;
            let barHeight;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                barHeight = dataArray[i];
                canvasCtx.fillStyle = `rgb(${barHeight + 100},50,50)`;
                canvasCtx.fillRect(x, HEIGHT - barHeight / 2, barWidth, barHeight / 2);
                x += barWidth + 1;
            }
        }
    };

    draw();
};



toggleVisualizationBtn.addEventListener('click', () => {
    isWaveform = !isWaveform;
    toggleVisualizationBtn.textContent = isWaveform ? "Switch to Frequency Spectrum" : "Switch to Waveform";
});


const fetchUserMedia = () => {
    return new Promise(async (resolve, reject) => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: { deviceId: audioInputSelect.value ? { exact: audioInputSelect.value } : undefined }
            });
            localAudioEl.srcObject = stream;
            localStream = stream;

            audioContext = new AudioContext();
            if (isFilterActive) {
                applyFilter(stream);
            }

            // Set up the audio visualizer
            setupVisualizer(stream);

            resolve();
        } catch (err) {
            console.log(err);
            reject();
        }
    });
};





navigator.mediaDevices.enumerateDevices().then(deviceInfos => {
    deviceInfos.forEach(deviceInfo => {
        const option = document.createElement('option');
        option.value = deviceInfo.deviceId;
        if (deviceInfo.kind === 'audioinput') {
            option.text = deviceInfo.label || `Microphone ${audioInputSelect.length + 1}`;
            audioInputSelect.appendChild(option);
        } else if (deviceInfo.kind === 'audiooutput') {
            option.text = deviceInfo.label || `Speaker ${audioOutputSelect.length + 1}`;
            audioOutputSelect.appendChild(option);
        }
    });
});


audioInputSelect.addEventListener('change', async () => {
    const audioSource = audioInputSelect.value;
    const stream = await navigator.mediaDevices.getUserMedia({
        audio: { deviceId: audioSource ? { exact: audioSource } : undefined },
    });
    localStream = stream;
    localAudioEl.srcObject = stream;
});


audioOutputSelect.addEventListener('change', () => {
    const audioDestination = audioOutputSelect.value;
    if (typeof remoteAudioEl.sinkId !== 'undefined') {
        remoteAudioEl.setSinkId(audioDestination).catch(err => console.log('Error setting output device', err));
    } else {
        console.warn('Browser does not support output device selection.');
    }
});





const call = async e=>{
    await fetchUserMedia();

   
    await createPeerConnection();

   
    try{
        console.log("Creating offer...")
        const offer = await peerConnection.createOffer();
        console.log(offer);
        peerConnection.setLocalDescription(offer);
        didIOffer = true;
        socket.emit('newOffer',offer); 
    }catch(err){
        console.log(err)
    }

}

const answerOffer = async(offerObj)=>{
    await fetchUserMedia()
    await createPeerConnection(offerObj);
    const answer = await peerConnection.createAnswer({}); 
    await peerConnection.setLocalDescription(answer); 
    console.log(offerObj)
    console.log(answer)
    
    offerObj.answer = answer 
   
    const offerIceCandidates = await socket.emitWithAck('newAnswer',offerObj)
    offerIceCandidates.forEach(c=>{
        peerConnection.addIceCandidate(c);
        console.log("======Added Ice Candidate======")
    })
    console.log(offerIceCandidates)
}

const addAnswer = async(offerObj)=>{
   
    await peerConnection.setRemoteDescription(offerObj.answer)
}


const createPeerConnection = (offerObj)=>{
    return new Promise(async(resolve, reject)=>{
    
        peerConnection = await new RTCPeerConnection(peerConfiguration)
        remoteStream = new MediaStream()
        remoteAudioEl.srcObject = remoteStream;


        localStream.getTracks().forEach(track=>{
            peerConnection.addTrack(track,localStream);
        })

        peerConnection.addEventListener("signalingstatechange", (event) => {
            console.log(event);
            console.log(peerConnection.signalingState)
        });

        peerConnection.addEventListener('icecandidate',e=>{
            console.log('........Ice candidate found!......')
            console.log(e)
            if(e.candidate){
                socket.emit('sendIceCandidateToSignalingServer',{
                    iceCandidate: e.candidate,
                    iceUserName: userName,
                    didIOffer,
                })    
            }
        })
        
        peerConnection.addEventListener('track',e=>{
            console.log("Got a track from the other peer!! How excting")
            console.log(e)
            e.streams[0].getTracks().forEach(track=>{
                remoteStream.addTrack(track);
                console.log("Here's an exciting moment... fingers cross")
            })
        })

        if(offerObj){
       
            await peerConnection.setRemoteDescription(offerObj.offer)
            
        }
        resolve();
    })
}

const addNewIceCandidate = iceCandidate=>{
    peerConnection.addIceCandidate(iceCandidate)
    console.log("======Added Ice Candidate======")
}



const hangup = () => {
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
        console.log("Peer connection closed.");
    }


    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null; 
        console.log("Local stream stopped.");
    }

    localAudioEl.srcObject = null; 
    remoteAudioEl.srcObject = null; 
    document.querySelector('#user-name').innerHTML = ""; 


    if (analyserNode) {
        analyserNode.disconnect();
    }
    

    console.log("Call ended.");
};


document.querySelector('#hangup').addEventListener('click', hangup);


document.querySelector('#call').addEventListener('click',call)


