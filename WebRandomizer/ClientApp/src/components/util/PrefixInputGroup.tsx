﻿import React from 'react'
import { InputGroup, InputGroupAddon, InputGroupText } from 'reactstrap'

export default function PrefixedIndexGroup(props: any) {
  const { className, prefixClassName, prefix, children } = props
  return (
    <InputGroup className={className}>
      <InputGroupAddon className={prefixClassName} addonType="prepend">
        <InputGroupText>{prefix}</InputGroupText>
      </InputGroupAddon>
      {children}
    </InputGroup>
  )
}
