import io from 'socket.io-client'
import React from 'react'
import Rating from 'react-rating'
import { Helmet } from 'react-helmet'
import Fingerprint2 from 'fingerprintjs2'
import LoadingScreen from 'react-loading-screen'
import { IoIosStarOutline, IoIosStar } from 'react-icons/io'
// import { createGlobalStyle } from 'styled-components'
import { mediaOptions } from './webrtc'

const socketURL = process.env.REACT_APP_SOCKET_URL
const companyID = 1

class Guest extends React.Component {
  constructor() {
    super()
    this.state = {
      callText: 'Connecting...',
      connecting: false,
      waiting: false,
      finished: false,
      rejected: false,
      interrupted: false,
      answered: false,
      pending: 0,
      inFront: 0,
      video: true,
      audio: true,
      rated: false,

      loading: true,
      custom: {
        logo: null,
        favicon: null,
        background: '#546e7a',
        font: null,
        fontColor: '#fff',
        title: 'VC App',
        header: 'Welcome',
        busyMsg: `We are now processing requests from customers who applied a little earlier`,
        waitingMsg: `Please wait, our agents will be ready soon`,
        waitingIcon: null,
        noAgentMsg: 'All our agents are busy now, try again later',
        noAgentIcon: null,
        callEndedMsg: 'Rate our answer, please',
        callEndedMsgAfter: 'Thank you for your attention to our service',
        callEndedIcon: null,
        closedMsg: 'Please call us during our working hours',
        btnCallAgainText: 'Call again',
        btnCallAgainColor: '#17a2b8',
        btnCallAgainTextColor: '#fff',
        geolocation: 1,
        recording: 1,
        rating: 1,
      }
    }
    this.connection = null
    this.localStream = null
    this.iceServers = []
    this.iceCandidates = []
  }

  componentDidMount = () => {
    this.connect()
  }
  componentWillUnmount = () => {
    this.socket.close()
  }

  connect = async () => {
    this.socket = new io(socketURL, { secure: true })
    this.socket.on('connect', async (data) => {
      console.log("Socket connected.", this.socket.id)
    })
    // ready ..
    this.socket.on('/v1/ready', async ({ iceServers }) => {
      const guestID = await this.generateGuestID()
      const payload = {
        stream: localStorage.getItem('stream') || null,
        guest: localStorage.getItem('guest') || guestID,
        company: companyID
      }
      this.iceServers = iceServers
      this.socket.emit('/v1/stream/init', payload)
      this.setState({ loading: false, waiting: true })
    })
    // Get stream details
    this.socket.on('/v1/stream/init', ({ stream, guest }) => {
      if (stream && guest) {
        this.guest = guest
        this.stream = stream
        localStorage.setItem('guest', guest)
        localStorage.setItem('stream', stream)
      } else {
        localStorage.clear()
      }
    })
    this.socket.on('/v1/stream/finish', (response) => {
      this.onCallFinish()
    })

    // Get sdp offer
    this.socket.on('/v1/stream/offer', (data) => {
      this.onSdpOffer(data)
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

  onSdpOffer = async (data) => {
    const callText = `Call #${this.stream}, Agent: #${data.agent}`
    this.setState({ callText, answered: true, connecting: false, waiting: false, rejected: false })
    try {
      this.connection = new RTCPeerConnection({ iceServers: this.iceServers })
      this.connection.ontrack = (e) => {
        this.remoteVideo.srcObject = e.streams[0]
      }
      this.connection.onicecandidate = (e) => {
        if (e.candidate) {
          this.socket.emit('/v1/ice/guest', { stream: this.stream, socket: this.socket.id, candidate: e.candidate })
        }
      }
      const sessDesc = new RTCSessionDescription({ type: 'offer', sdp: data.sdp })
      await this.connection.setRemoteDescription(sessDesc)
      this.localStream = await navigator.mediaDevices.getUserMedia(mediaOptions)
      this.localVideo.srcObject = this.localStream
      this.localStream.getTracks().forEach(track => this.connection.addTrack(track, this.localStream))

      const answer = await this.connection.createAnswer()
      await this.connection.setLocalDescription(answer)

      const payload = {
        stream: this.stream,
        guest: this.guest,
        sdp: this.connection.localDescription.sdp,
        // video: this.state.video,
        // audio: this.state.audio,
        // recording: this.recording
      }
      this.socket.emit('/v1/stream/answer', payload)
    } catch (error) {
      console.error('onSdpOffer', error)
    }
  }

  finishCall = () => {
    this.socket.emit('/v1/stream/finish', { stream: this.stream, by: 'guest', user: this.guest })
  }

  onCallFinish = async (rejected) => {
    this.setState({
      answered: false,
      waiting: false,
      connecting: false,
      finished: !rejected,
      rejected: rejected,
    })
    this.socket.close()
    this.lastStream = this.stream

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
  }

  generateGuestID = async () => {
    const components = await Fingerprint2.getPromise({})
    const values = components.map(function (component) { return component.value })
    const murmur = Fingerprint2.x64hash128(values.join(''), 31)
    return murmur
  }

  recall = () => {
    this.connect()
    this.setState({
      callText: 'Connecting...',
      connecting: false,
      waiting: true,
      finished: false,
      rejected: false,
      interrupted: false,
      answered: false,
      pending: 0,
      inFront: 0,
      video: true,
      audio: true,
    })
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

  // renderGlobalStyle = (custom) => {
  //   const GlobalStyle = createGlobalStyle`
  //     @font-face {
  //       font-family: "Custom";
  //       src: url(${custom.font});
  //     }
  //     .waiting  {
  //       animation: pulse 5s infinite;
  //     }
  //     .btn-callagain {
  //       background: ${custom.btnCallAgainColor};
  //       color: ${custom.btnCallAgainTextColor};
  //       opacity: 0.8;
  //     }
  //     .btn-callagain:hover {
  //       opacity: 1;
  //     }
  //     @keyframes pulse {
  //       0% { opacity: 1; }
  //       50% { opacity: 0.3; }
  //       100% { opacity: 1; }
  //     }
  //   `
  //   return <GlobalStyle />
  // }

  render() {
    const { callText, custom, loading, rated } = this.state
    const style = {
      backgroundColor: custom.enableStyle ? custom.background : '#546e7a',
      color: custom.enableStyle ? custom.fontColor : '#fff',
      fontFamily: 'Custom',
    }
    if (loading) {
      return (
        <LoadingScreen
          loading={loading}
          bgColor='#fff'
          spinnerColor='#676767'
          textColor='#930C56'
        >&nbsp;</LoadingScreen>
      )
    } else {
      return (
        <div style={style}>
          {/* {custom.enableStyle ? this.renderGlobalStyle(custom) : ''} */}
          <Helmet>
            <title>{custom.title}</title>
            <link rel="apple-touch-icon" href={custom.favicon} />
            <link rel="icon" href={custom.favicon} />
          </Helmet>
          <img className="custom-logo" src={custom.logo || '/logo.png'} alt="" />
          {
            this.state.waiting &&
            <div className="custom text-center">
              <div>
                <h3>{custom.header}</h3>
                {custom.busyMsg}<br /><br />
                <img className="mt-2" width={200} src={custom.noAgentIcon || '/noAgentIcon.png'} alt="" />
              </div>
            </div>
          }
          {
            this.state.connecting &&
            <div className="custom text-center">
              <div>
                <label dangerouslySetInnerHTML={{ __html: custom.waitingMsg }} /> <br />
                <img className="mt-2 waiting" width={200} src={custom.waitingIcon || '/waitingIcon.png'} alt="" />
              </div>
            </div>
          }
          {
            this.state.answered &&
            <div>
              <div className="localVideo">
                <label>{callText}</label><br />
                <video id="localVideo" autoPlay muted playsInline ref={video => (this.localVideo = video)}></video>
              </div>
              <video id="remoteVideo" autoPlay playsInline ref={video => (this.remoteVideo = video)}></video>
              <div className="buttons clear text-center">
                <i className={this.buttonStyle('audio')} onClick={() => this.toggleMedia('audio')}></i>
                <i className={this.buttonStyle('video')} onClick={() => this.toggleMedia('video')}></i>
                <i className="hangup fas fa fa-phone-slash" onClick={() => this.finishCall()}></i>
              </div>
            </div>

          }
          {
            this.state.rejected &&
            <div className="custom text-center">
              <div>
                <label dangerouslySetInnerHTML={{ __html: custom.noAgentMsg }} /><br />
                <img className="mt-2" width={200} src={custom.noAgentIcon || '/noAgentIcon.png'} alt="" />
              </div>
            </div>
          }
          {
            this.state.interrupted &&
            <div className="custom text-center">
              <h2>Hold...</h2>
            </div>
          }
          {
            this.state.finished &&
            <div className="custom text-center">
              <div>
                {custom.callEndedMsg} <br />
                {
                  (!rated && custom.rating) &&
                  <div>
                    <Rating
                      emptySymbol={<IoIosStarOutline size={30} />}
                      fullSymbol={<IoIosStar size={30} />}
                      initialRating={0}
                      onChange={this.onRating}
                    /> <br />
                  </div>
                }
                <br />
                <img className="mt-2" width={200} src={custom.callEndedIcon} alt="" />
                <br /> <br />
                <button className="btn btn-callagain" onClick={this.recall}>{custom.btnCallAgainText}</button>
              </div>
            </div>
          }
          {
            this.state.closed &&
            <div className="custom text-center">
              <div>
                {custom.closedMsg} <br />
                <img className="mt-2" width={200} src="/workingHours.png" alt="" />
              </div>
            </div>
          }
        </div>
      )
    }
  }
}

export default Guest

