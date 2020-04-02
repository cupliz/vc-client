import React from 'react'
import { withRouter } from 'react-router-dom'
import io from 'socket.io-client'
import Login from './Login'
import { mediaOptions, offerOptions } from './webrtc'

const socketURL = process.env.REACT_APP_SOCKET_URL
class Consultant extends React.Component {
  constructor() {
    super()
    this.state = {
      loggedIn: false,
      callText: 'Connecting...',
      video: true,
      audio: true,
      pending: 0,
      waiting: true,
      connecting: false,
      incoming: false,
      answering: false,
    }
    this.checkInterval = null
    this.connection = null
    this.socketId = null
    this.localStream = null
    this.iceServers = []
    this.iceCandidates = []
  }
  componentDidMount = async () => {
    this.connect()
  }
  componentWillUnmount = () => {
    this.socket.close()
  }
  connect = async () => {
    this.audioPlayer = new Audio()
    this.audioPlayer.src = '/call.mp3'
    this.audioPlayer.volume = 0
    this.audioPlayer.muted = true
    this.audioPlayer.loop = true

    this.socket = new io(socketURL, { secure: true })
    this.socket.on('connect', () => {
      console.log('Socket connected.', this.socket.id)
      this.socketId = this.socket.id
    })
    // Get stream details
    this.socket.on('/v1/ready', async ({ iceServers }) => {
      if (localStorage.agent) {
        this.agent = localStorage.agent
        this.setState({ loggedIn: true })
      }
      this.iceServers = iceServers
      for (const turn of iceServers) {
        const turnActive = await this.checkTURNServer(turn)
        console.log(`TURN server ${turn.urls} active? `, turnActive ? 'yes' : 'no')
      }
    })

    this.socket.on('/v1/user/login', (res) => {
      if (res.agent) {
        localStorage.setItem('agent', res.agent)
        this.setState({ loggedIn: true, agent: res.agent })
      } else {
        alert('login failed')
      }
    })

    this.socket.on('/v1/stream/idle', ({ idle }) => {
      this.setState({ pending: idle })
      this.nextCall()
    })

    this.socket.on('/v1/stream/next', (res) => {
      clearInterval(this.checkInterval)
      if (res.stream) {
        console.log('Vistor found, ready for a call', res)
        this.stream = res.stream
        this.audioPlayer.volume = 0.2
        this.audioPlayer.muted = false
        this.setState({ incoming: true })
        setTimeout(() => {
          this.audioPlayer.muted = true
          this.audioPlayer.volume = 0
        }, 3000)
      } else {
        console.error('/v1/stream/next', res.message)
      }
    })
    this.socket.on('/v1/stream/answer', (res) => {
      this.onSdpAnswer(res)
    })
    this.socket.on('/v1/stream/finish', (response) => {
      this.onCallFinish()
    })

    // Get ice exchange
    this.socket.on('/v1/ice/candidate', (data) => {
      if (this.connection) {
        console.log('ice candidate: ', data.candidate)
        this.connection.addIceCandidate(new RTCIceCandidate(data.candidate))
      } else {
        this.iceCandidates.push(data.candidate)
      }
    })
  }

  checkTURNServer(turnConfig, timeout) {
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        if (promiseResolved) return;
        resolve(false);
        promiseResolved = true;
      }, timeout || 5000);

      var promiseResolved = false
        , myPeerConnection = window.RTCPeerConnection || window.mozRTCPeerConnection || window.webkitRTCPeerConnection   //compatibility for firefox and chrome
        , pc = new myPeerConnection({ iceServers: [turnConfig] })
        , noop = function () { };
      pc.createDataChannel("");    //create a bogus data channel
      pc.createOffer(function (sdp) {
        if (sdp.sdp.indexOf('typ relay') > -1) { // sometimes sdp contains the ice candidates...
          promiseResolved = true;
          resolve(true);
        }
        pc.setLocalDescription(sdp, noop, noop);
      }, noop);    // create offer and set local description
      pc.onicecandidate = function (ice) {  //listen for candidate events
        if (promiseResolved || !ice || !ice.candidate || !ice.candidate.candidate || !(ice.candidate.candidate.indexOf('typ relay') > -1)) return;
        promiseResolved = true;
        resolve(true);
      };
    });
  }

  acceptCall = async (e, recording) => {
    this.recording = recording ? true : false
    this.setState({
      answering: true,
      waiting: false,
      incoming: false,
      connecting: false,
    })
    this.connection = new RTCPeerConnection({ iceServers: this.iceServers })
    this.connection.onnegotiationneeded = this.onnegotiationneeded
    this.connection.onicecandidate = this.onicecandidate
    this.connection.ontrack = (e) => {
      this.remoteVideo.srcObject = e.streams[0]
    }
    this.localStream = await navigator.mediaDevices.getUserMedia(mediaOptions)
    this.localVideo.srcObject = this.localStream
    this.localStream.getTracks().forEach(track => this.connection.addTrack(track, this.localStream))
  }
  onicecandidate = (e) => {
    if (e.candidate) {
      this.socket.emit('/v1/ice/agent', { stream: this.stream, socket: this.socket.id, candidate: e.candidate })
    }
  }
  onnegotiationneeded = async (e) => {
    const offer = await this.connection.createOffer()
    await this.connection.setLocalDescription(offer)
    const payload = {
      stream: this.stream,
      agent: this.agent,
      sdp: this.connection.localDescription.sdp,
      // video: this.state.video,
      // audio: this.state.audio,
      // recording: this.recording
    }
    // console.log('onnegotiationneeded, phase:', e.eventPhase, payload)
    this.socket.emit('/v1/stream/offer', payload)
  }

  onSdpAnswer = async ({ guest, sdp }) => {
    const callText = 'Call #' + this.stream + ', visitor: #' + guest
    this.setState({ callText, answering: true, waiting: false })
    console.log('Call started: visitor ' + guest)

    const sessDesc = new RTCSessionDescription({ type: 'answer', sdp })
    await this.connection.setRemoteDescription(sessDesc)
  }

  callConnecting = async (wait) => {
    if (wait) {
      this.muted = true
      this.audioPlayer.play()
      this.setState({ connecting: true })
      this.nextCall()
    } else {
      clearInterval(this.checkInterval)
      this.audioPlayer.pause()
      this.setState({ connecting: false })
    }
  }

  nextCall = () => {
    if (!this.state.answering) {
      console.log('nextCall', this.state.answering)
      this.socket.emit('/v1/stream/next')
    }
    clearInterval(this.checkInterval)
    this.checkInterval = setInterval(() => {
      this.nextCall()
    }, 1000)
  }

  finishCall = () => {
    this.socket.emit('/v1/stream/finish', { stream: this.stream, by: 'agent', user: this.agent })
  }

  onCallFinish = async () => {
    this.setState({ answering: false, waiting: true, connecting: true })

    this.iceCandidates = []
    this.stream = null
    if (this.localStream) {
      const tracks = this.localStream.getTracks()
      for (let i in tracks) {
        tracks[i].stop()
      }
      this.localStream = null
    }
    if (this.connection) {
      this.connection.close()
      this.connection = null
    }
    if (this.remoteVideo) { this.remoteVideo.srcObject = null }
    if (this.localVideo) { this.localVideo.srcObject = null }
    this.nextCall()
  }

  toggleMedia = (type) => {
    let { audio, video } = this.state
    if (type === 'audio') {
      audio = !audio
    }
    if (type === 'video') {
      video = !video
    }
    this.setState({ audio, video })
    if (this.stream) {
      const data = { stream: this.stream, video, audio }
      this.socket.emit('/v1/stream/media', data)
      this.localStream.getAudioTracks()[0].enabled = audio
      this.localStream.getVideoTracks()[0].enabled = video
    }
  }

  submitLogin = async (e) => {
    e.preventDefault()
    const { username, password } = e.target
    if (!username.value) {
      alert('Username cannot be empty')
    }
    if (!password.value) {
      alert('Password cannot be empty')
    }
    const payload = { username: username.value, password: password.value }
    this.socket.emit('/v1/user/login', payload)
  }

  logout = () => {
    const cfrm = window.confirm('Are you sure?')
    if (cfrm) {
      localStorage.clear()
      // this.socket.emit('/v1/user/logout', payload)
      this.setState({ loggedIn: false })
    }
  }

  buttonStyle = (type) => {
    let style = `fas fa`
    if (type === 'audio') {
      style += ` audio `
      style += this.state.audio ? 'fa-microphone' : 'fa-microphone-slash active'
    }
    if (type === 'video') {
      style += ` video `
      style += this.state.video ? 'fa-video' : 'fa-video-slash active'
    }
    if (type === 'hangup') {
      style += `hangup fa-phone-slash`
    }
    return style
  }

  render() {
    if (this.state.loggedIn) {
      return (
        <div style={{ backgroundColor: '#eee' }}>
          {
            this.state.waiting &&
            <div className="custom text-center">
              <div>
                {
                  this.state.incoming && this.state.connecting ?
                    <label>Incoming call...</label>
                    :
                    <label>Hello, There are <span className="badge">{this.state.pending}</span> users in queue.</label>
                }
                <br />
                {
                  this.state.connecting ?
                    <button className="btn btn-primary mr-2" onClick={() => this.callConnecting(0)}>
                      Stop waiting for user
                    </button>
                    :
                    <button className="btn btn-success mr-2" onClick={() => this.callConnecting(1)}>
                      Accept next call
                    </button>
                }
                <button className="btn btn-danger mr-2" onClick={this.logout}>Logout</button>
                <br />
                <br />
                {
                  (this.state.incoming && this.state.connecting) &&
                  <div>
                    <button className="btn btn-success mr-2" onClick={this.acceptCall}>Accept call</button>
                    <button className="btn btn-success mr-2" onClick={(e) => this.acceptCall(e, true)}>Accept with
                    recording
                    </button>
                    <button className="btn btn-danger mr-2" onClick={this.rejectCall}>Reject call</button>
                  </div>
                }
              </div>
            </div>
          }

          {
            this.state.interrupted &&
            <div className="custom text-center">
              <div>
                <label>Hold...</label>
              </div>
            </div>
          }

          {
            this.state.answering &&
            <div>
              <div className="localVideo">
                <label>{this.state.callText}</label><br />
                <video id="localVideo" autoPlay muted playsInline ref={video => (this.localVideo = video)}></video>
              </div>
              <video id="remoteVideo" autoPlay playsInline ref={video => (this.remoteVideo = video)}></video>
              <div className="buttons clear text-center">
                <i className={this.buttonStyle('audio')} onClick={() => this.toggleMedia('audio')}></i>
                <i className={this.buttonStyle('video')} onClick={() => this.toggleMedia('video')}></i>
                <i className="hangup fas fa fa-phone-slash" onClick={() => this.finishCall()}></i>
              </div>
              <img className="call-logo" src="/logo.png" alt="" />
            </div>
          }
        </div>
      )
    } else {
      return <Login submit={this.submitLogin} />
    }
  }
}

export default withRouter(Consultant)

