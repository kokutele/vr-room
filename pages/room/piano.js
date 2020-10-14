//@flow

import { useEffect, useState, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import Head from 'next/head'
import Layout, { siteTitle } from '../../components/layout'

// import { join } from './libs/mediasoup-handler'

import { selectAudioTracks, selectVideoTracks, addTrack } from '../../slices/room-slice'

import {
  Button
} from 'antd'
import {
  UserAddOutlined
} from '@ant-design/icons'

import * as THREE from 'three'
import ColladaLoader from 'three-collada-loader'
// import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'

import * as Tone from 'tone'

import style from './piano.module.css'
import { render } from 'react-dom'

function useVRRoom(room:React.RefObject, stream: React.RefObject):void {
  const thetas = [ 15, 45, 75, 105, 135, 165 ]
  // const thetas = [ 0, 45, 90, 135, 180 ] // , 105, 135, 165 ]
  const r = 90 
  function init( room:HTMLElement ):{ scene:THREE.Scene, camera: THREE.Camera, renderer: THREE.WebGL1Renderer} {
    // setup scene and camera
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera( 45, room.offsetWidth / room.offsetHeight, 1, 1280 )
    camera.position.set( 4, 2, r + 12 )
    camera.lookAt( 0, -0.42, 0 )

    const ambiLight = new THREE.AmbientLight( 0x0c0c0c )
    scene.add(ambiLight)
    
    // setup renderer
    const renderer = new THREE.WebGLRenderer()
    //renderer.setClearColor( 0x140909 )
    renderer.setClearColor( 0x000000 )
    renderer.setSize( room.offsetWidth, room.offsetHeight )
    renderer.shadowMap.enabled = true

    room.appendChild( renderer.domElement )

    return {
      scene, camera, renderer
    }
  }

  function setupAxes( scene:THREE.Scene ):void {
    const axes = new THREE.AxisHelper(50)
    scene.add( axes )
  }

  function setupLine( scene:THREE.Scene ):THREE.Line {
    // line
    const material = new THREE.LineBasicMaterial( { color: 0x0000ff } )
    const points = []
    points.push( new THREE.Vector3( -10, 0, 0 ))
    points.push( new THREE.Vector3( 0, 10, 0 ))
    points.push( new THREE.Vector3( 10, 0, 0 ))
    const geometry = new THREE.BufferGeometry().setFromPoints( points )

    const line = new THREE.Line( geometry, material)
    scene.add(line)
  
    return line
  }

  function setupPlane( scene ) {
    const geometry = new THREE.CircleGeometry( 2 * r, 250 )
    // const geometry = new THREE.PlaneGeometry( 3 * r,  3 * r )
    const material = new THREE.MeshLambertMaterial({ color: 0x0a0a0a })
    // const material = new THREE.MeshBasicMaterial({ color: 0xffffff })
    const plane = new THREE.Mesh( geometry, material )
    plane.rotateX( -Math.PI / 2 )
    plane.position.y = -20
    plane.receiveShadow = true

    scene.add( plane )

  }
  function setupCubes( scene, theta ) {
    const k = 1, rb = 10

    const geometry = new THREE.BoxGeometry( rb, rb * 1.2, rb )
    const material = new THREE.MeshLambertMaterial({
      color: 0xffffff
    })

    const cube = new THREE.Mesh( geometry, material )
    cube.rotateY( ( -90 + theta ) * Math.PI / 180 )
    cube.position.x = r * Math.cos( -theta * Math.PI / 180 )
    cube.position.y = -15
    cube.position.z = r * Math.sin( -theta * Math.PI / 180 )
    cube.castShadow = true

    scene.add( cube )

    const color = 0xf62008
    //const color = 0x00ffff
    const spotLight = new THREE.SpotLight( color )
    spotLight.position.set( 
      r * k * Math.cos( -theta * Math.PI / 180),
      100,
      r * k * Math.sin( -theta * Math.PI / 180),
    )
    spotLight.angle = Math.PI / 4
    spotLight.target = cube
    spotLight.castShadow = true
    scene.add( spotLight )
 
  }

  function setupCanvas( scene:THREE.Scene, idx:number ):{ctx: CanvasRenderingContext2D, texture: THREE.Texture} {
    // canvas
    const theta = thetas[idx]
    const canvas = document.createElement('canvas')
    canvas.width = 640
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    const texture = new THREE.Texture( canvas )
    const geometry = new THREE.PlaneGeometry(32, 24)
    const material = new THREE.MeshBasicMaterial( {map: texture} )
    const mesh = new THREE.Mesh( geometry, material )
    // mesh.rotateY( idx % 2 === 0 ? Math.PI / 2 : -1 * Math.PI / 2 )
    // mesh.rotateY( (-theta) * Math.PI / 180)
    mesh.rotateY( ( -90 + theta ) * Math.PI / 180 )
    mesh.position.x = r * Math.cos( -theta * Math.PI / 180 )
    mesh.position.y = 10
    mesh.position.z = r * Math.sin( -theta * Math.PI / 180 )
    mesh.castShadow = true
    // mesh.position.x = idx % 2 === 0 ? -50 : 50
    // mesh.position.z = -35 * Math.floor( idx / 2 )
    scene.add(mesh)

    return { ctx, texture }
  }

  let reqPianoId

  function setupPiano( { scene, camera, renderer } ) {
    const keyState = Object.freeze ({unpressed: {}, note_on: {}, pressed:{}, note_off:{} });
    const keys_obj = []
      , keys_down = []
    const xRotation = -Math.PI / 2 // Math.PI / 6.0;
    const controls = new function() {
      this.key_attack_time = 9.0;
      this.key_max_rotation = xRotation - Math.PI / 48;
      this.octave = 2;
      this.song = "game_of_thrones.mid";
      this.noteOnColor = [255, 0, 0, 1.0];
      this.play = function () {
        // MIDI.Player.resume();
      };
      this.stop = function () {
        // MIDI.Player.stop();
      }
    };
    const noteOnColor = new THREE.Color().setRGB(controls.noteOnColor[0]/256.0, controls.noteOnColor[1]/256.0, controls.noteOnColor[2]/256.0);

    const synth = new Tone.Synth().toDestination()

    function prepare_scene( collada ) {
      console.log( collada )
      collada.scene.traverse(initialize_keys);
      collada.scene.position.set( -5.5, -2, r )
      collada.scene.castShadow = true
      scene.add(collada.scene);

      init_lights( collada.scene )
    }

    function initialize_keys(obj) {
      keys_obj.push(obj);
      obj.rotation.x = xRotation;
      obj.rotation.y = 0;
      obj.rotation.z = 0;
      obj.keyState = keyState.unpressed;
      obj.clock = new THREE.Clock(false);
      obj.castShadow = true;
      obj.receiveShadow = true;

      // only add meshes in the material redefinition (to make keys change their color when pressed)
      if (obj instanceof THREE.Mesh) {
        const old_material = obj.material;
        obj.material = new THREE.MeshPhongMaterial({ color: old_material.color });
        obj.material.shininess = 35.0;
        obj.material.specular = new THREE.Color().setRGB(0.25, 0.25, 0.25);;
        obj.material.note_off = obj.material.color.clone();

      }
    }

    function init_lights( target ) {
      //var spotlight = new THREE.SpotLight(0xffffff);
      const spotlight = new THREE.SpotLight(0xffffff);

      spotlight.position.set( -5.5, 10, r )
      //spotlight.position.set(1.0, 2.4, -7.5);
      //spotlight.position.set( -5.5, -2, r )
      //spotlight.target.position.set(6.0, -6, 7);
      spotlight.target = target
      // spotlight.shadowCameraVisible = false;
      // spotlight.shadowDarkness = 0.75;
      //spotlight.intensity = 1;
      spotlight.castShadow = true;
      // spotlight.shadowMapWidth = 2048;
      // spotlight.shadowMapHeight = 2048;

      // spotlight.shadowCameraNear = 5.0;
      // spotlight.shadowCameraFar = 20.0;
      // spotlight.shadowBias = 0.0025;

      // spotlight.shadowCameraLeft = -8.85;
      // spotlight.shadowCameraRight = 5.5;
      // spotlight.shadowCameraTop = 4;
      // spotlight.shadowCameraBottom = 0;
      scene.add(spotlight);

      // const light0 = new THREE.DirectionalLight(0xddffff, 0.5);
      // light0.position.set(1, 1, 1).normalize();
      // scene.add(light0);

      // const light1 = new THREE.DirectionalLight(0xff5555, 0.5);
      // light1.position.set(-1, -1, -1).normalize();
      // scene.add(light1);
    }

    function keyCode_to_note(keyCode):number {
      let note = -1;
      //-----------------------------------
      if (keyCode == 90) note = 0; // C 0
      if (keyCode == 83) note = 1; // C#0
      if (keyCode == 88) note = 2; // D 0
      if (keyCode == 68) note = 3; // D#0
      if (keyCode == 67) note = 4; // E 0
      if (keyCode == 86) note = 5; // F 0
      if (keyCode == 71) note = 6; // F#0
      if (keyCode == 66) note = 7; // G 0
      if (keyCode == 72) note = 8; // G#0
      if (keyCode == 78) note = 9; // A 0
      if (keyCode == 74) note = 10; // A#0
      if (keyCode == 77) note = 11; // B 0
      if (keyCode == 188) note = 12; // C 0

      //-----------------------------------
      if (keyCode == 81) note = 12; // C 1
      if (keyCode == 50) note = 13; // C#1
      if (keyCode == 87) note = 14; // D 1
      if (keyCode == 51) note = 15; // D#1
      if (keyCode == 69) note = 16; // E 1
      if (keyCode == 82) note = 17; // F 1
      if (keyCode == 53) note = 18; // F#1
      if (keyCode == 84) note = 19; // G 1
      if (keyCode == 54) note = 20; // G#1
      if (keyCode == 89) note = 21; // A 1
      if (keyCode == 55) note = 22; // A#1
      if (keyCode == 85) note = 23; // B 1
      //-----------------------------------
      if (keyCode == 73) note = 24; // C 2
      if (keyCode == 57) note = 25; // C#2
      if (keyCode == 79) note = 26; // D 2
      if (keyCode == 48) note = 27; // D#2
      if (keyCode == 80) note = 28; // E 2
      if (keyCode == 219) note = 29; // F 2
      if (keyCode == 187) note = 30; // F#2
      if (keyCode == 221) note = 31; // G 2
      // //-----------------------------------

      if (note == -1) return -1;

      return ("_" + (note + controls.octave * 12));
    }

    function smoothstep(a, b, x) {
      if (x < a) return 0.0;
      if (x > b) return 1.0;
      var y = (x - a) / (b - a);
      return y * y * (3.0 - 2.0 * y);
    }

    function mix(a, b, x) {
      return a + (b - a) * Math.min(Math.max(x, 0.0), 1.0);
    } 

    function key_status (keyName, status) {
      const obj = scene.getObjectByName(keyName, true);
      if (obj != undefined) {
        obj.clock.start();
        obj.clock.elapsedTime = 0;
        obj.keyState = status;
      }
    }
    window.onkeyup = function (ev) {
      if (keys_down[ev.keyCode] == true) {
        const note = keyCode_to_note(ev.keyCode);
        key_status(note, keyState.note_off);
        keys_down[ev.keyCode] = false;

        const delay = 0; // play one note every quarter second
        const _note = parseInt(note.substr(1)) + 21;
        const velocity = 127;// how hard the note hits
        // MIDI.setVolume(0, 127);
        // MIDI.noteOff(0, note, delay + 0.08);
      }

    } 

    window.onkeydown = function(ev) {
      if (keys_down[ev.keyCode] != true) {
        const note = keyCode_to_note(ev.keyCode);
        if (note != -1) {
          key_status(note, keyState.note_on);
          keys_down[ev.keyCode] = true;

          // const delay = 0; // play one note every quarter second
          const midiNote = parseInt(note.substr(1)) + 36; 
          const hz = ( 440 / 32 ) * Math.pow( 2, (( midiNote - 9 ) / 12))
          // const velocity = 127; // how hard the note hits
          // MIDI.setVolume(0, 127);
          // MIDI.noteOn(0, note, velocity, delay);
          synth.triggerAttackRelease( hz, "8n")
        }
      }
    }     

    function frame() {
      reqPianoId = requestAnimationFrame(frame);

      var delta = clock.getDelta();

      update(delta);

      render(delta);
    }


    function update_key(obj, delta) {
      if (obj.keyState == keyState.note_on) {
        obj.rotation.x = mix( xRotation, controls.key_max_rotation, smoothstep(0.0, 1.0, controls.key_attack_time * obj.clock.getElapsedTime()));
        if (obj.rotation.x <= controls.key_max_rotation) {
          obj.keyState = keyState.pressed;
          obj.clock.elapsedTime = 0;
        }
        if( obj.children && obj.children[0].material ) {
          obj.children[0].material.color = noteOnColor;
        }
      }
      else if (obj.keyState == keyState.note_off) {
        obj.rotation.x = mix(controls.key_max_rotation, xRotation, smoothstep(0.0, 1.0, controls.key_attack_time * obj.clock.getElapsedTime()));
        if (obj.rotation.x >= xRotation) {
          obj.keyState = keyState.unpressed;
          obj.clock.elapsedTime = 0;
        }
        if( obj.children && obj.children[0].material ) {
          obj.children[0].material.color = obj.children[0].material.note_off;
        }
      }
    }

    function update(delta) {
      // cameraControls.update(delta);
      for (let i in keys_obj) {
        update_key(keys_obj[i], delta);
      }
    }

    function render( delta ) {
      renderer.render( scene, camera )
    }

    const loader = new ColladaLoader();
    loader.load( '/assets/piano.dae', prepare_scene )
    //init_lights()

    const clock = new THREE.Clock()

    frame()
  }

  const videoTracks = useSelector( selectVideoTracks )

  useEffect( () => {
    const _room = room.current
    const _stream = stream
    let reqId, _videos = []

    if( _room && _stream ) {
      // WebGL の初期設定
      const { scene, camera, renderer} = init( _room )

      // テスト用の三角線をセットする
      let line
      // const line = setupLine( scene )
      // setupAxes( scene )

      setupPlane( scene )

      for( let theta of thetas ) {
        setupCubes( scene, theta )
      }

      // ピアノのセット
      setupPiano( {scene, camera, renderer} )

      // redux stateに基づき、video表示用の canvas を生成すると
      // ともに、video objectも生成
      if( videoTracks.length > 0 ) {
        const { peerId, track } = videoTracks[0]

        for( let idx = 0; idx < thetas.length; idx++ ) {
          const { ctx, texture } = setupCanvas( scene, idx )
          const video = document.createElement('video')
          const stream = new MediaStream([track])
          video.srcObject = stream
          video.autoplay = true

          _videos.push( {peerId, ctx, texture, video, idx} )
        }
      }
      //_videos = videoTracks.map( ({ peerId, track }, idx) => {
      //  const {ctx, texture} = setupCanvas( scene, idx )
      //  const video = document.createElement('video') 
      //  const stream = new MediaStream([track])
      //  video.srcObject = stream
      //  video.autoplay = true

      //  return {
      //    peerId, ctx, texture, video, idx
      //  }
      //})

      let direction = 1
      function animation() {
        reqId = requestAnimationFrame(animation)

        // animation - line
        if( line ) {
          if (line.position.z < -320) direction = 1
          else if (line.position.z > 100) direction = -1
          line.position.z += direction
        }

        // 各video用の canvas に `drawImage` を用い、逐次
        // 描画する
        _videos.forEach( ({ctx, texture, video}) => {
          texture.needsUpdate = true
          ctx.drawImage( video, 0, 0, 640, 480 )
        })
        renderer.render(scene, camera)
      }
      animation()
    }

    return function cleanup(){
      // slow but simple way to remove all children;)
      if( _room ) _room.innerText = ''
      if( reqId ) {
        cancelAnimationFrame(reqId)
        reqId = undefined
      }
      if( reqPianoId ) {
        cancelAnimationFrame( reqPianoId )
        reqPianoId = undefined
      }
      _videos.forEach( item => {
        delete item.texture
        delete item.video
        delete item.ctx
      })
    }
  }, [room, stream, videoTracks])
}

function useVideo( setStream:Function ) {
  useEffect(() => {
    navigator.mediaDevices.getUserMedia({video: true, audio: true})
      .then( setStream )
      .catch( console.error )
  }, [])
}



export default function PianoRoom():React.Node {
  const room = useRef()
  const [stream, setStream] = useState()
  const dispatch = useDispatch()
  const audioTracks = useSelector( selectAudioTracks )

  useVideo(setStream)

  useVRRoom(room, stream)

  // test
  useEffect(() => {
    if( stream ) {
      const  [ videoTrack ] = stream.getVideoTracks()
      dispatch(addTrack({
        id: "test-video", 
        track: videoTrack, 
        peerId: "localId", 
        type: "producer"
      }))

      const  [ audioTrack ] = stream.getAudioTracks()
      dispatch(addTrack({
        id: "test-audio", 
        track: audioTrack, 
        peerId: "localId", 
        type: "producer"
      }))
    }
  }, [stream])



  // useEffect( () => {
  //   let _peer
  //   if( stream ) {
  //     join({ dispatch, roomName: 'test', stream, scalable: 'simple'})
  //       .then( peer => _peer = peer )
  //   }

  //   return function cleanup() {
  //     if( _peer ) {
  //       _peer.close()
  //     }
  //     if( stream ) {
  //       stream.getTracks().forEach( t => t.stop() )
  //     }
  //   }
  // }, [stream])

  return (
    <Layout>
      <Head>
        <title>{siteTitle} - Piano Room</title>
      </Head>
      <div>
        <div className={style.room} ref={e => room.current = e}></div>
        { false && (
        <div className={style.buttons}>
          <Button type="primary" shape="circle" size="large"
            onClick={e => {
              const peerid = Math.ceil(Math.random() * 1000).toString()
              streams.set( peerid, stream )
              dispatch( addMember(peerid) )
            }}
          danger icon={<UserAddOutlined/>}></Button>
        </div>
        )}
        { audioTracks.map( (item, idx) => (
          <audio ref={e => {
            if( e ) {
              const stream = new MediaStream([ item.track ])
              e.srcObject = stream
            }
          }} key={idx} autoPlay />
        ))}
      </div>
    </Layout>
  )
}