import React, { useState, useRef, useContext } from 'react'
import { Form, Row, Col, Button } from 'reactstrap'
import { readAsArrayBuffer } from '../file/util'
import { h32 } from 'xxhashjs'

import { GameTraitsCtx } from '../game/traits'

import localForage from 'localforage'

import some from 'lodash/some'
import map from 'lodash/map'
import compact from 'lodash/compact'
import hasIn from 'lodash/hasIn'

/* "SMZ3" as UTF8 in big-endian */
const HashSeed = 0x534d5a33
const Z3Hash = 0x8ac8fd15
const SMHash = 0xcadb4883

export default function Upload(props) {
  const [canUpload, setCanUpload] = useState(false)
  const fileInputSM = useRef({} as any)
  const fileInputZ3 = useRef({} as any)
  const game = useContext(GameTraitsCtx)

  async function onSubmitRom() {
    if (fileInputSM.current === null) {
      return
    }
    const smFile = fileInputSM.current !== null ? fileInputSM.current?.files[0] : null
    const z3File = fileInputZ3.current !== null ? fileInputZ3?.current?.files[0] : null

    let fileDataSM
    let fileDataZ3
    const mismatch = {} as any

    try {
      fileDataSM = new Uint8Array(await readAsArrayBuffer(smFile))
      if (fileDataSM.length % 0x1000 === 0x200) {
        fileDataSM = fileDataSM.slice(0x200)
      }
      mismatch.SM = h32(fileDataSM.buffer, HashSeed).toNumber() !== SMHash
    } catch (error) {
      console.log('Could not read uploaded SM file data:', error)
      return
    }

    if (game.id === 'z3') {
      try {
        fileDataZ3 = new Uint8Array(await readAsArrayBuffer(z3File))
        if (fileDataZ3.length % 0x1000 === 0x200) {
          fileDataZ3 = fileDataZ3.slice(0x200)
        }
        mismatch.ALTTP = h32(fileDataZ3.buffer, HashSeed).toNumber() !== Z3Hash
      } catch (error) {
        console.log('Could not read uploaded ALTTP file data:', error)
        return
      }
    }

    if (some(mismatch)) {
      const games = compact(map(mismatch, (truth, name) => (truth ? name : null)))
      alert(`Incorrect ${games.join(', ')} rom file(s)`)
      return
    }

    try {
      if (fileDataSM) await localForage.setItem('baseRomSM', new Blob([fileDataSM]))
      if (fileDataZ3) await localForage.setItem('baseRomLTTP', new Blob([fileDataZ3]))
    } catch (error) {
      console.log('Could not store file to localforage:', error)
      return
    }

    props.onUpload()
  }

  const onFileSelect = () => {
    setCanUpload(
      (game.id === 'smz' &&
        hasIn(fileInputSM.current, 'files[0]') &&
        hasIn(fileInputZ3.current, 'files[0]')) ||
        (game.id === 'sm' && hasIn(fileInputSM.current, 'files[0]'))
    )
  }

  return (
    <Form
      onSubmit={(e) => {
        e.preventDefault()
        onSubmitRom()
      }}
    >
      <h6>No ROM uploaded, please upload a valid ROM file.</h6>
      <Row className="justify-content-between">
        {game.id === 'z3' && (
          <Col md="6">
            ALTTP ROM: <input type="file" ref={fileInputZ3} onChange={onFileSelect} />
          </Col>
        )}
        <Col md="6">
          SM ROM: <input type="file" ref={fileInputSM} onChange={onFileSelect} />
        </Col>
      </Row>
      <Row className="mt-3">
        <Col md="6">
          <Button type="submit" color="primary" disabled={!canUpload}>
            Upload Files
          </Button>
        </Col>
      </Row>
    </Form>
  )
}
