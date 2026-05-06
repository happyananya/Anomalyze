interface ConfusionMatrixProps {
  tp: number;
  fn: number;
  fp: number;
  tn: number;
}

export default function ConfusionMatrix({ tp, fn, fp, tn }: ConfusionMatrixProps) {
  return (
    <div className="confusion-matrix">
      <div className="confusion-matrix__cell confusion-matrix__cell--tp">
        <div className="confusion-matrix__value">{tp.toLocaleString()}</div>
        <div className="confusion-matrix__label">True positive</div>
      </div>
      <div className="confusion-matrix__cell confusion-matrix__cell--fn">
        <div className="confusion-matrix__value">{fn.toLocaleString()}</div>
        <div className="confusion-matrix__label">False negative</div>
      </div>
      <div className="confusion-matrix__cell confusion-matrix__cell--fp">
        <div className="confusion-matrix__value">{fp.toLocaleString()}</div>
        <div className="confusion-matrix__label">False positive</div>
      </div>
      <div className="confusion-matrix__cell confusion-matrix__cell--tn">
        <div className="confusion-matrix__value">{tn.toLocaleString()}</div>
        <div className="confusion-matrix__label">True negative</div>
      </div>
    </div>
  );
}
